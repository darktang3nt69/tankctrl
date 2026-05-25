import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tankctl_app/providers/relay_config_provider.dart';
import 'relay_config_tile.dart';
import 'add_relay_dialog.dart';

/// Screen for managing device relay GPIO configurations
class RelayConfigScreen extends ConsumerWidget {
  final String deviceId;

  const RelayConfigScreen({
    super.key,
    required this.deviceId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final relaysAsync = ref.watch(relayConfigListProvider(deviceId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Relay Configuration'),
        elevation: 0,
      ),
      body: relaysAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(),
        ),
        error: (error, stack) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error, size: 64, color: Colors.red),
              const SizedBox(height: 16),
              const Text('Failed to load relay configuration'),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () =>
                    ref.refresh(relayConfigListProvider(deviceId)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (relays) => relays.isEmpty
            ? Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.router,
                      size: 64,
                      color: Colors.grey[300],
                    ),
                    const SizedBox(height: 16),
                    const Text('No relays configured'),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: () => _showAddRelayDialog(context, ref),
                      icon: const Icon(Icons.add),
                      label: const Text('Add Relay'),
                    ),
                  ],
                ),
              )
            : ListView.builder(
                itemCount: relays.length,
                itemBuilder: (context, index) => RelayConfigTile(
                  relay: relays[index],
                  deviceId: deviceId,
                  onUpdate: () =>
                      ref.refresh(relayConfigListProvider(deviceId)),
                ),
              ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddRelayDialog(context, ref),
        tooltip: 'Add Relay',
        child: const Icon(Icons.add),
      ),
    );
  }

  void _showAddRelayDialog(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (context) => AddRelayDialog(
        deviceId: deviceId,
        onRelayAdded: () => ref.refresh(relayConfigListProvider(deviceId)),
      ),
    );
  }
}
