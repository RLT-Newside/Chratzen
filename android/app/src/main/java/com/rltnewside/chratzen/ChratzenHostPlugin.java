package com.rltnewside.chratzen;

import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Nimmt WebSocket-Verbindungen im lokalen Netz an und reicht die Nachrichten
 * unveraendert an die WebView weiter. Die gesamte Spiellogik bleibt in
 * TypeScript — dieses Plugin ist bewusst nur eine Leitung.
 */
@CapacitorPlugin(name = "ChratzenHost")
public class ChratzenHostPlugin extends Plugin {

    private static final int MAX_FRAME = 4096;

    private WebSocketServer server;
    private final Map<String, WebSocket> clients = new ConcurrentHashMap<>();

    @PluginMethod
    public void start(PluginCall call) {
        if (server != null) {
            call.reject("Tisch laeuft bereits");
            return;
        }

        int port = call.getInt("port", 3001);

        try {
            server = new HostServer(new InetSocketAddress(port));
            server.setReuseAddr(true);
            server.start();
        } catch (Exception e) {
            server = null;
            call.reject("Port " + port + " nicht verfuegbar: " + e.getMessage());
            return;
        }

        // ponytail: Bildschirm anlassen statt Foreground-Service. Der Host schaut
        // ohnehin aufs Geraet. Laeuft der Tisch mal im Hintergrund weiter muessen,
        // wird hier ein Foreground-Service mit Notification noetig.
        keepAwake(true);

        JSObject result = new JSObject();
        result.put("ip", localIpv4());
        result.put("port", port);
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
        WebSocket socket = clients.get(connId);
        if (socket != null && socket.isOpen()) socket.send(data);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        shutdown();
    }

    private void shutdown() {
        keepAwake(false);
        clients.clear();
        if (server == null) return;
        try {
            server.stop(200);
        } catch (Exception ignored) {
            // Beim Herunterfahren ist ein haengender Socket egal.
        }
        server = null;
    }

    private void keepAwake(boolean on) {
        if (getActivity() == null) return;
        getActivity()
            .runOnUiThread(() -> {
                if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
    }

    /** Erste private IPv4 eines aktiven Interfaces — das ist die WLAN-Adresse. */
    private String localIpv4() {
        try {
            List<NetworkInterface> interfaces = Collections.list(NetworkInterface.getNetworkInterfaces());
            for (NetworkInterface nic : interfaces) {
                if (!nic.isUp() || nic.isLoopback()) continue;
                for (InetAddress address : Collections.list(nic.getInetAddresses())) {
                    if (address instanceof Inet4Address && address.isSiteLocalAddress()) {
                        return address.getHostAddress();
                    }
                }
            }
        } catch (Exception ignored) {
            // Ohne Netz gibt es nichts anzuzeigen.
        }
        return "";
    }

    private class HostServer extends WebSocketServer {

        HostServer(InetSocketAddress address) {
            super(address);
        }

        @Override
        public void onOpen(WebSocket socket, ClientHandshake handshake) {
            String connId = UUID.randomUUID().toString();
            socket.setAttachment(connId);
            clients.put(connId, socket);
            notifyListeners("open", payload(connId, null));
        }

        @Override
        public void onMessage(WebSocket socket, String message) {
            if (message.length() > MAX_FRAME) {
                socket.close();
                return;
            }
            String connId = socket.getAttachment();
            if (connId != null) notifyListeners("message", payload(connId, message));
        }

        @Override
        public void onClose(WebSocket socket, int c, String reason, boolean remote) {
            String connId = socket.getAttachment();
            if (connId == null) return;
            clients.remove(connId);
            notifyListeners("close", payload(connId, null));
        }

        @Override
        public void onError(WebSocket socket, Exception e) {
            if (socket == null) return;
            String connId = socket.getAttachment();
            if (connId != null) clients.remove(connId);
        }

        @Override
        public void onStart() {
            setConnectionLostTimeout(30);
        }

        private JSObject payload(String connId, String data) {
            JSObject out = new JSObject();
            out.put("connId", connId);
            if (data != null) out.put("data", data);
            return out;
        }
    }
}
