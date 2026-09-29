package com.rltnewside.chratzen;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Lokales Plugin: nimmt im LAN Verbindungen an, damit dieses Geraet
        // selbst den Tisch hosten kann.
        registerPlugin(ChratzenHostPlugin.class);
        // Dasselbe ohne WLAN: Tisch und Gaeste per Bluetooth.
        registerPlugin(ChratzenBluetoothPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
