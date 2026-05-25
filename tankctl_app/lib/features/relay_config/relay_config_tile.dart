import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tankctl_app/domain/relay_config.dart';
import 'package:tankctl_app/providers/relay_config_provider.dart';
import 'edit_relay_dialog.dart';

/// Tile widget displaying individual relay configuration
class RelayConfigTile extends ConsumerWidget {
  final RelayConfig relay;
  final String deviceId;
  final VoidCallback onUpdate;

  const RelayConfigTile({
    super.key,
    required this.relay,
    required this.deviceId,
    required this.onUpdate,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Card(
        child: ListTile(
          leading: const Icon(Icons.router),
          title: Text(relay.relayName),
          subtitle: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 4),
              Text(
                'GPIO ${relay.gpioPin} • ${relay.activeLevel} • ${relay.defaultState.toUpperCase()}',
                style: Theme.of(context).textTheme.labelSmall,
              ),
              if (relay.description != null && relay.description!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    relay.description!,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: Colors.grey[600],
                        ),
                  ),
                ),
            ],
          ),
          trailing: PopupMenuButton<String>(
            onSelected: (String result) {
              if (result == 'edit') {
                _showEditDialog(context, ref);
              } else if (result == 'delete') {
                _showDeleteConfirmDialog(context, ref);
              }
            },
            itemBuilder: (BuildContext context) => <PopupMenuEntry<String>>[
              const PopupMenuItem<String>(
                value: 'edit',
                child: Row(
                  children: [
                    Icon(Icons.edit, size: 18),
                    SizedBox(width: 8),
                    Text('Edit'),
                  ],
                ),
              ),
              const PopupMenuItem<String>(
                value: 'delete',
                child: Row(
                  children: [
                    Icon(Icons.delete, size: 18, color: Colors.red),
                    SizedBox(width: 8),
                    Text('Delete', style: TextStyle(color: Colors.red)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showEditDialog(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (context) => EditRelayDialog(
        relay: relay,
        deviceId: deviceId,
        onRelayUpdated: onUpdate,
      ),
    );
  }

  void _showDeleteConfirmDialog(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Relay'),
        content: Text('Delete relay "${relay.relayName}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () async {
              try {
                await ref
                    .read(relayConfigNotifierProvider(deviceId).notifier)
                    .deleteRelay(relay.id);
                if (context.mounted) {
                  Navigator.pop(context);
                  onUpdate();
                }
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Failed to delete relay: $e'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              }
            },
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}
