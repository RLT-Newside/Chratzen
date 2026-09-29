package com.rltnewside.chratzen;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.location.LocationManager;
import android.os.Build;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.core.content.IntentCompat;
import androidx.core.location.LocationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Tisch ohne WLAN: dieselbe Leitung wie ChratzenHostPlugin, nur ueber
 * Bluetooth (RFCOMM). Der Host nimmt Verbindungen an, Gaeste suchen sein
 * Geraet und verbinden sich. Pro Verbindung laufen JSON-Zeilen hin und her —
 * die Spiellogik bleibt in TypeScript.
 *
 * Anders als beim WLAN-Tisch brauchen hier alle die App: ein Browser kann
 * kein Bluetooth Classic. Den Geraetenamen fassen wir bewusst nicht an —
 * Umbenennen waere bequemer zum Finden, aber fremdes Eigentum.
 *
 * Fehler gehen als Code an die WebView (unavailable, denied, location, off,
 * listen, connect); die Texte dazu stehen in transport.ts.
 */
@SuppressLint("MissingPermission") // geprueft ueber die Aliase unten, das sieht Lint nicht
@CapacitorPlugin(
    name = "ChratzenBluetooth",
    permissions = {
        // Ab Android 12 ein einziger Dialog: "Geraete in der Naehe".
        @Permission(
            alias = "nearby",
            strings = {
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_ADVERTISE
            }
        ),
        // Bis Android 11 findet die Geraetesuche ohne Standort nichts.
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class ChratzenBluetoothPlugin extends Plugin {

    /** Daran erkennen Gaeste den Tisch (SDP). Nie aendern, sonst finden sich alte und neue Versionen nicht. */
    private static final UUID SERVICE = UUID.fromString("fb1bc9ba-1edd-48b2-9fc0-3b8e92cd0dbe");
    /** Vorsilbe der Verbindungs-IDs — daran erkennt die WebView den Draht. */
    private static final String PREFIX = "bt:";
    /** Ein Zug ist ein paar hundert Byte, wie beim WLAN-Tisch. */
    private static final int MAX_FROM_GUEST = 4096;
    /** Ein Spielstand mit acht Spielern hat gut 4 KB. */
    private static final int MAX_FROM_HOST = 64 * 1024;
    /** So lange taucht der Host in der Suche der Gaeste auf. */
    private static final int VISIBLE_SECONDS = 300;

    private final AtomicReference<BluetoothServerSocket> server = new AtomicReference<>();
    private final Map<String, Link> links = new ConcurrentHashMap<>();
    private BroadcastReceiver finder;

    /** Eine offene Verbindung, Host- wie Gastseite. */
    private static final class Link {

        final String id = PREFIX + UUID.randomUUID();
        final BluetoothSocket socket;
        /** Eigener Schreib-Thread: eine haengende Verbindung blockiert sonst alle Plugin-Aufrufe. */
        final ExecutorService writer = Executors.newSingleThreadExecutor();

        Link(BluetoothSocket socket) {
            this.socket = socket;
        }
    }

    /** Host: Tisch per Bluetooth anbieten und kurz sichtbar werden. Nochmals aufrufen macht wieder sichtbar. */
    @PluginMethod
    public void host(PluginCall call) {
        prepare(call);
    }

    /** Gast: gekoppelte Geraete sofort, gefundene danach als "device"-Ereignis, am Ende "scanEnd". */
    @PluginMethod
    public void scan(PluginCall call) {
        prepare(call);
    }

    /**
     * Gast: mit dem Host verbinden. Zeigt keine Dialoge — laeuft auch beim
     * stillen Wiederverbinden, und dort soll nicht alle paar Sekunden etwas
     * aufpoppen. Die Dialoge kamen schon bei der Suche.
     */
    @PluginMethod
    public void connect(PluginCall call) {
        BluetoothAdapter adapter = adapter();
        String address = call.getString("address", "");
        if (adapter == null) {
            call.reject("Kein Bluetooth", "unavailable");
            return;
        }
        if (missingPermission(call) != null) {
            call.reject("Keine Berechtigung", "denied");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("Bluetooth aus", "off");
            return;
        }
        if (!BluetoothAdapter.checkBluetoothAddress(address)) {
            call.reject("Unbekanntes Geraet", "connect");
            return;
        }

        // Eine laufende Suche bremst den Verbindungsaufbau massiv.
        adapter.cancelDiscovery();
        BluetoothDevice device = adapter.getRemoteDevice(address);
        new Thread(
            () -> {
                BluetoothSocket socket = null;
                try {
                    // Insecure: keine Kopplung noetig, also kein Dialog auf beiden Seiten.
                    socket = device.createInsecureRfcommSocketToServiceRecord(SERVICE);
                    socket.connect();
                } catch (IOException | RuntimeException e) {
                    // Auch Laufzeitfehler: in diesem Thread wuerden sie die App abschiessen.
                    quietly(socket);
                    call.reject("Kein Tisch erreichbar", "connect");
                    return;
                }
                Link link = new Link(socket);
                links.put(link.id, link);
                JSObject result = new JSObject();
                result.put("connId", link.id);
                // Erst antworten, dann lesen: sonst kaeme eine Nachricht vor ihrer connId an.
                call.resolve(result);
                read(link, MAX_FROM_HOST);
            },
            "chratzen-bt-connect"
        ).start();
    }

    @PluginMethod
    public void send(PluginCall call) {
        String connId = call.getString("connId");
        String data = call.getString("data");
        Link link = connId == null ? null : links.get(connId);
        if (link != null && data != null) {
            byte[] line = (data + "\n").getBytes(StandardCharsets.UTF_8);
            try {
                link.writer.execute(() -> {
                    try {
                        OutputStream out = link.socket.getOutputStream();
                        out.write(line);
                        out.flush();
                    } catch (IOException e) {
                        drop(link.id);
                    }
                });
            } catch (RejectedExecutionException closed) {
                // Verbindung ist gerade weggebrochen — "close" ist schon unterwegs.
            }
        }
        call.resolve();
    }

    /** Gast: eine Verbindung sauber schliessen, etwa beim Verlassen des Tisches. */
    @PluginMethod
    public void disconnect(PluginCall call) {
        String connId = call.getString("connId");
        if (connId != null) drop(connId);
        call.resolve();
    }

    /** Alles zu: Server, Verbindungen, Suche. */
    @PluginMethod
    public void stop(PluginCall call) {
        shutdown();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        shutdown();
    }

    // --- Vorbereitung: Berechtigung, dann Bluetooth an, dann proceed() ---

    private void prepare(PluginCall call) {
        BluetoothAdapter adapter = adapter();
        if (adapter == null) {
            call.reject("Kein Bluetooth", "unavailable");
            return;
        }
        String alias = missingPermission(call);
        if (alias != null) {
            requestPermissionForAlias(alias, call, "permissionDone");
            return;
        }
        if (!adapter.isEnabled()) {
            startActivityForResult(call, new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), "enableDone");
            return;
        }
        if ("host".equals(call.getMethodName())) listen(call);
        else discover(call);
    }

    @PermissionCallback
    private void permissionDone(PluginCall call) {
        if (call == null) return;
        String alias = missingPermission(call);
        if (alias == null) prepare(call);
        else call.reject("Berechtigung verweigert", alias.equals("location") ? "location" : "denied");
    }

    @ActivityCallback
    private void enableDone(PluginCall call, ActivityResult result) {
        if (call == null) return;
        BluetoothAdapter adapter = adapter();
        if (adapter != null && adapter.isEnabled()) prepare(call);
        else call.reject("Bluetooth aus", "off");
    }

    /** Welcher Alias noch fehlt — oder null, wenn alles da ist. */
    private String missingPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return getPermissionState("nearby") == PermissionState.GRANTED ? null : "nearby";
        }
        // Bis Android 11 reichen die Installations-Rechte — nur die Suche will Standort.
        boolean scanning = "scan".equals(call.getMethodName());
        return scanning && getPermissionState("location") != PermissionState.GRANTED ? "location" : null;
    }

    // --- Host ---

    private void listen(PluginCall call) {
        if (server.get() == null) {
            BluetoothServerSocket listening;
            try {
                listening = adapter().listenUsingInsecureRfcommWithServiceRecord("Chratzen", SERVICE);
            } catch (IOException e) {
                call.reject("Server ging nicht auf", "listen");
                return;
            }
            server.set(listening);
            new Thread(() -> accept(listening), "chratzen-bt-accept").start();
        }
        Intent visible = new Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE);
        visible.putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, VISIBLE_SECONDS);
        startActivityForResult(call, visible, "visibleDone");
    }

    /** Abgelehnt ist kein Fehler: gekoppelte Gaeste finden den Tisch auch so. */
    @ActivityCallback
    private void visibleDone(PluginCall call, ActivityResult result) {
        if (call == null) return;
        BluetoothAdapter adapter = adapter();
        String name = adapter == null ? null : adapter.getName();
        JSObject info = new JSObject();
        info.put("name", name == null ? "" : name);
        info.put("visible", result.getResultCode() != Activity.RESULT_CANCELED);
        call.resolve(info);
    }

    private void accept(BluetoothServerSocket listening) {
        try {
            while (true) {
                Link link = new Link(listening.accept());
                links.put(link.id, link);
                new Thread(() -> read(link, MAX_FROM_GUEST), "chratzen-bt-read").start();
            }
        } catch (IOException closed) {
            // stop() oder Bluetooth aus. Danach darf host() einen neuen Server aufmachen.
            server.compareAndSet(listening, null);
            quietly(listening);
        }
    }

    // --- Gast: Suche ---

    private void discover(PluginCall call) {
        BluetoothAdapter adapter = adapter();
        JSArray devices = new JSArray();
        Set<BluetoothDevice> bonded = adapter.getBondedDevices();
        if (bonded != null) {
            for (BluetoothDevice device : bonded) {
                if (candidate(device, device.getBluetoothClass())) devices.put(describe(device, device.getName()));
            }
        }

        watchDiscovery();
        adapter.cancelDiscovery();
        JSObject result = new JSObject();
        result.put("devices", devices);
        result.put("searching", adapter.startDiscovery());
        // Bis Android 11 liefert die Suche bei ausgeschaltetem Standort still nichts.
        result.put("locationOff", Build.VERSION.SDK_INT < Build.VERSION_CODES.S && !locationOn());
        call.resolve(result);
    }

    private void watchDiscovery() {
        if (finder != null) return;
        finder = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(intent.getAction())) {
                    notifyListeners("scanEnd", new JSObject());
                    return;
                }
                BluetoothDevice device = IntentCompat.getParcelableExtra(
                    intent,
                    BluetoothDevice.EXTRA_DEVICE,
                    BluetoothDevice.class
                );
                BluetoothClass cls = IntentCompat.getParcelableExtra(intent, BluetoothDevice.EXTRA_CLASS, BluetoothClass.class);
                if (device == null || !candidate(device, cls)) return;
                String name = intent.getStringExtra(BluetoothDevice.EXTRA_NAME);
                notifyListeners("device", describe(device, name != null ? name : device.getName()));
            }
        };
        IntentFilter filter = new IntentFilter(BluetoothDevice.ACTION_FOUND);
        filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
        // Die Meldungen schickt die System-App Bluetooth, nicht Android selbst —
        // mit NOT_EXPORTED kaemen sie gar nicht an.
        ContextCompat.registerReceiver(getContext(), finder, filter, ContextCompat.RECEIVER_EXPORTED);
    }

    /**
     * Nur Handys und Tablets: Kopfhoerer, Autos und Uhren hosten keinen Tisch
     * und machen die Liste bloss unuebersichtlich.
     */
    private static boolean candidate(BluetoothDevice device, BluetoothClass cls) {
        if (device.getType() == BluetoothDevice.DEVICE_TYPE_LE) return false;
        if (cls == null) return true;
        int major = cls.getMajorDeviceClass();
        return major == BluetoothClass.Device.Major.PHONE || major == BluetoothClass.Device.Major.COMPUTER;
    }

    private static JSObject describe(BluetoothDevice device, String name) {
        JSObject info = new JSObject();
        info.put("address", device.getAddress());
        info.put("name", name == null || name.isEmpty() ? device.getAddress() : name);
        info.put("paired", device.getBondState() == BluetoothDevice.BOND_BONDED);
        return info;
    }

    private boolean locationOn() {
        LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        return lm != null && LocationManagerCompat.isLocationEnabled(lm);
    }

    // --- Leitung ---

    /**
     * Zeilen lesen, bis die Verbindung weg ist. Jede Zeile ist eine Nachricht;
     * JSON enthaelt nie ein rohes \n, und in UTF-8 kommt das Byte nur als
     * Zeilenende vor.
     */
    private void read(Link link, int maxLine) {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        byte[] chunk = new byte[1024];
        try {
            InputStream in = link.socket.getInputStream();
            for (int n; (n = in.read(chunk)) != -1; ) {
                for (int i = 0; i < n; i++) {
                    if (chunk[i] != '\n') {
                        line.write(chunk[i]);
                        // Wer ewig ohne Zeilenende schickt, fliegt, bevor der Speicher voll ist.
                        if (line.size() > maxLine) return;
                        continue;
                    }
                    JSObject payload = new JSObject();
                    payload.put("connId", link.id);
                    payload.put("data", new String(line.toByteArray(), StandardCharsets.UTF_8));
                    notifyListeners("message", payload);
                    line.reset();
                }
            }
        } catch (IOException gone) {
            // Ausser Reichweite, Bluetooth aus oder Gegenseite zu — alles dasselbe.
        } finally {
            drop(link.id);
        }
    }

    private void drop(String connId) {
        Link link = links.remove(connId);
        if (link == null) return;
        link.writer.shutdownNow();
        quietly(link.socket);
        JSObject payload = new JSObject();
        payload.put("connId", connId);
        notifyListeners("close", payload);
    }

    private void shutdown() {
        quietly(server.getAndSet(null));
        for (String connId : links.keySet()) drop(connId);
        if (finder == null) return;
        BluetoothAdapter adapter = adapter();
        if (adapter != null) adapter.cancelDiscovery();
        getContext().unregisterReceiver(finder);
        finder = null;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager manager = getContext().getSystemService(BluetoothManager.class);
        return manager == null ? null : manager.getAdapter();
    }

    private static void quietly(Closeable closeable) {
        if (closeable == null) return;
        try {
            closeable.close();
        } catch (IOException ignored) {
            // Zu ist zu.
        }
    }
}
