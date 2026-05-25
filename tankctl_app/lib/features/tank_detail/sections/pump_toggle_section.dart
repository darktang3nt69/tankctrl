import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tankctl_app/providers/pump_provider.dart';

/// Pump toggle control widget for device detail screen
class PumpToggleSection extends ConsumerWidget {
  final String deviceId;

  const PumpToggleSection({super.key, required this.deviceId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pumpStateAsync = ref.watch(pumpStateFamilyProvider(deviceId));

    return pumpStateAsync.when(
      loading: () => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Card(
          child: ListTile(
            title: const Text('Pump'),
            subtitle: const Text('Loading...'),
            leading: const Icon(Icons.water),
            trailing: const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
        ),
      ),
      error: (error, stack) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Card(
          color: Colors.red.shade50,
          child: ListTile(
            title: const Text('Pump'),
            subtitle: Text('Error: ${error.toString()}'),
            leading: const Icon(Icons.warning, color: Colors.red),
          ),
        ),
      ),
      data: (state) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Card(
          child: SwitchListTile(
            title: const Text('Pump'),
            subtitle: Text(
              state == 'on' ? 'Running' : 'Stopped',
              style: TextStyle(
                color: state == 'on' ? Colors.green : Colors.grey,
                fontWeight: FontWeight.w500,
              ),
            ),
            value: state == 'on',
            onChanged: (value) async {
              try {
                await ref
                    .read(pumpStateFamilyProvider(deviceId).notifier)
                    .setPumpState(value ? 'on' : 'off');
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Failed to update pump: $e'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              }
            },
            secondary: const Icon(Icons.water),
          ),
        ),
      ),
    );
  }
}
