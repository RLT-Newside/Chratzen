package com.rltnewside.chratzen;

import android.content.res.AssetManager;
import android.view.WindowManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import fi.iki.elonen.NanoHTTPD;
import fi.iki.elonen.NanoWSD;

/**
 * Macht dieses Geraet zum Tisch: liefert die Web-App aus der APK per HTTP aus
 * und nimmt auf demselben Port WebSocket-Verbindungen an. Gaeste brauchen damit
 * nur einen Browser im gleichen Netz, keine Installation.
 *
 * Die Spiellogik bleibt vollstaendig in TypeScript — dieses Plugin ist Leitung
 * und Dateiausgabe, sonst nichts.
 */
@CapacitorPlugin(name = "ChratzenHost")
public class ChratzenHostPlugin extends Plugin {

    private static final int MAX_FRAME = 4096;
    private static final int PING_SECONDS = 20;
    /** Die von Capacitor kopierten Web-Assets liegen unter assets/public. */
    private static final String WEB_ROOT = "public";

    private HostServer server;
    private ScheduledExecutorService pinger;
    private final Map<String, NanoWSD.WebSocket> clients = new ConcurrentHashMap<>();

    @PluginMethod
    public void start(PluginCall call) {
        if (server != null) {
            call.reject("Tisch laeuft bereits");
            return;
        }

        int port = call.getInt("port", 3001);
        try {
            server = new HostServer(port);
            server.start(NanoHTTPD.SOCKET_READ_TIMEOUT, true);
        } catch (Exception e) {
            server = null;
            call.reject("Port " + port + " nicht verfuegbar: " + e.getMessage());
            return;
        }

        startPinger();

        // ponytail: Bildschirm anlassen statt Foreground-Service. Der Host schaut
        // ohnehin aufs Geraet. Soll der Tisch im Hintergrund weiterlaufen, braucht
        // es hier einen Foreground-Service mit Notification.
        keepAwake(true);

        List<JSObject> nics = localAddresses();
        JSObject result = new JSObject();
        result.put("port", port);
        result.put("ip", nics.isEmpty() ? "" : nics.get(0).getString("ip"));
        JSArray list = new JSArray();
        for (JSObject nic : nics) list.put(nic);
        result.put("interfaces", list);
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        shutdown();
        call.resolve();
    }

    @PluginMethod
    public void send(PluginCall call) {
        String connId = call.getString("connId");
        String data = call.getString("data");
        if (connId == null || data == null) {
            call.reject("connId und data noetig");
            return;
        }
        NanoWSD.WebSocket socket = clients.get(connId);
        if (socket != null && socket.isOpen()) {
            try {
                socket.send(data);
            } catch (IOException e) {
                drop(connId);
            }
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        shutdown();
    }

    private void shutdown() {
        keepAwake(false);
        if (pinger != null) {
            pinger.shutdownNow();
            pinger = null;
        }
        clients.clear();
        if (server == null) return;
        server.stop();
        server = null;
    }

    /**
     * Tote Verbindungen faellt sonst niemandem auf: ein Handy ausser Reichweite
     * schliesst nichts sauber. Der Ping deckt das auf, damit der Host merkt,
     * dass er einspringen darf.
     */
    private void startPinger() {
        pinger = Executors.newSingleThreadScheduledExecutor();
        pinger.scheduleWithFixedDelay(
            () -> {
                for (Map.Entry<String, NanoWSD.WebSocket> entry : clients.entrySet()) {
                    try {
                        entry.getValue().ping(new byte[0]);
                    } catch (Exception e) {
                        drop(entry.getKey());
                    }
                }
            },
            PING_SECONDS,
            PING_SECONDS,
            TimeUnit.SECONDS
        );
    }

    private void drop(String connId) {
        if (clients.remove(connId) == null) return;
        JSObject payload = new JSObject();
        payload.put("connId", connId);
        notifyListeners("close", payload);
    }

    private void keepAwake(boolean on) {
        if (getActivity() == null) return;
        getActivity()
            .runOnUiThread(() -> {
                if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
    }

    /**
     * Alle privaten IPv4-Adressen aktiver Interfaces. Der Server lauscht auf
     * allen, deshalb sind das gleichwertige Adressen — die UI laesst waehlen,
     * welche vorgelesen wird. Hotspot zuerst: laeuft er, sind die Gaeste dort.
     */
    private List<JSObject> localAddresses() {
        List<JSObject> hotspot = new ArrayList<>();
        List<JSObject> wifi = new ArrayList<>();
        List<JSObject> other = new ArrayList<>();

        try {
            for (NetworkInterface nic : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nic.isUp() || nic.isLoopback()) continue;
                String name = nic.getName().toLowerCase(Locale.ROOT);
                String kind = name.startsWith("ap") || name.contains("swlan") || name.startsWith("rndis")
                    ? "hotspot"
                    : name.startsWith("wlan") ? "wlan" : "other";

                for (InetAddress address : Collections.list(nic.getInetAddresses())) {
                    if (!(address instanceof Inet4Address) || !address.isSiteLocalAddress()) continue;
                    JSObject entry = new JSObject();
                    entry.put("name", nic.getName());
                    entry.put("ip", address.getHostAddress());
                    entry.put("kind", kind);
                    if (kind.equals("hotspot")) hotspot.add(entry);
                    else if (kind.equals("wlan")) wifi.add(entry);
                    else other.add(entry);
                }
            }
        } catch (Exception ignored) {
            // Ohne Netz gibt es nichts anzuzeigen; die UI warnt dann.
        }

        List<JSObject> all = new ArrayList<>(hotspot);
        all.addAll(wifi);
        all.addAll(other);
        return all;
    }

    private static String mimeOf(String path) {
        int dot = path.lastIndexOf('.');
        String ext = dot < 0 ? "" : path.substring(dot + 1).toLowerCase(Locale.ROOT);
        switch (ext) {
            case "html": return "text/html; charset=utf-8";
            case "js": return "text/javascript; charset=utf-8";
            case "css": return "text/css; charset=utf-8";
            case "json": case "webmanifest": return "application/json; charset=utf-8";
            case "svg": return "image/svg+xml";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "ico": return "image/x-icon";
            case "woff2": return "font/woff2";
            case "woff": return "font/woff";
            case "ttf": return "font/ttf";
            default: return "application/octet-stream";
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        try (InputStream stream = in) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = stream.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toByteArray();
        }
    }

    private class HostServer extends NanoWSD {

        HostServer(int port) {
            super(port);
        }

        @Override
        protected WebSocket openWebSocket(IHTTPSession handshake) {
            return new GuestSocket(handshake);
        }

        /** Liefert die Web-App aus der APK — deshalb braucht kein Gast die APK. */
        @Override
        protected Response serveHttp(IHTTPSession session) {
            String uri = session.getUri();
            // Kein Ausbrechen aus dem Asset-Ordner.
            if (uri.contains("..")) {
                return newFixedLengthResponse(Response.Status.FORBIDDEN, "text/plain", "nope");
            }
            return asset(uri.startsWith("/") ? uri.substring(1) : uri, true);
        }

        private Response asset(String path, boolean allowFallback) {
            String file = path.isEmpty() ? "index.html" : path;
            AssetManager assets = getContext().getAssets();
            try {
                byte[] data = readAll(assets.open(WEB_ROOT + "/" + file));
                return newFixedLengthResponse(
                    Response.Status.OK,
                    mimeOf(file),
                    new ByteArrayInputStream(data),
                    data.length
                );
            } catch (IOException missing) {
                // Single-Page-App: unbekannte Pfade bekommen die index.html.
                if (allowFallback) return asset("index.html", false);
                return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "nicht gefunden");
            }
        }
    }

    private class GuestSocket extends NanoWSD.WebSocket {

        private final String connId = UUID.randomUUID().toString();

        GuestSocket(NanoHTTPD.IHTTPSession handshake) {
            super(handshake);
        }

        @Override
        protected void onOpen() {
            clients.put(connId, this);
            JSObject payload = new JSObject();
            payload.put("connId", connId);
            notifyListeners("open", payload);
        }

        @Override
        protected void onClose(NanoWSD.WebSocketFrame.CloseCode code, String reason, boolean remote) {
            drop(connId);
        }

        @Override
        protected void onMessage(NanoWSD.WebSocketFrame frame) {
            String text = frame.getTextPayload();
            if (text == null) return;
            if (text.length() > MAX_FRAME) {
                drop(connId);
                try {
                    close(NanoWSD.WebSocketFrame.CloseCode.MessageTooBig, "zu gross", false);
                } catch (IOException ignored) {
                    // Verbindung ist ohnehin schon weg.
                }
                return;
            }
            JSObject payload = new JSObject();
            payload.put("connId", connId);
            payload.put("data", text);
            notifyListeners("message", payload);
        }

        @Override
        protected void onPong(NanoWSD.WebSocketFrame pong) {
            // Antwort auf unseren Ping — die Verbindung lebt, nichts zu tun.
        }

        @Override
        protected void onException(IOException e) {
            drop(connId);
        }
    }
}
