import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tankctl_app/domain/relay_config.dart';
import 'package:tankctl_app/providers/relay_config_provider.dart';

/// Dialog for editing an existing relay configuration
class EditRelayDialog extends ConsumerStatefulWidget {
  final RelayConfig relay;
  final String deviceId;
  final VoidCallback onRelayUpdated;

  const EditRelayDialog({
    super.key,
    required this.relay,
    required this.deviceId,
    required this.onRelayUpdated,
  });

  @override
  ConsumerState<EditRelayDialog> createState() => _EditRelayDialogState();
}

class _EditRelayDialogState extends ConsumerState<EditRelayDialog> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _nameController;
  late TextEditingController _gpioController;
  late TextEditingController _descriptionController;
  late String _activeLevel;
  late String _defaultState;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.relay.relayName);
    _gpioController =
        TextEditingController(text: widget.relay.gpioPin.toString());
    _descriptionController =
        TextEditingController(text: widget.relay.description ?? '');
    _activeLevel = widget.relay.activeLevel;
    _defaultState = widget.relay.defaultState;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _gpioController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Edit Relay'),
      content: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Relay Name
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'Relay Name',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Please enter a relay name';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),

              // GPIO Pin
              TextFormField(
                controller: _gpioController,
                decoration: const InputDecoration(
                  labelText: 'GPIO Pin',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Please enter a GPIO pin number';
                  }
                  final pin = int.tryParse(value);
                  if (pin == null || pin < 0 || pin > 39) {
                    return 'GPIO pin must be between 0 and 39';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),

              // Active Level Dropdown
              DropdownButtonFormField<String>(
                value: _activeLevel,
                decoration: const InputDecoration(
                  labelText: 'Active Level',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'HIGH', child: Text('HIGH')),
                  DropdownMenuItem(value: 'LOW', child: Text('LOW')),
                ]
                    .map((item) => DropdownMenuItem<String>(
                          value: item.value,
                          child: item.child,
                        ))
                    .toList(),
                onChanged: (value) {
                  if (value != null) {
                    setState(() => _activeLevel = value);
                  }
                },
              ),
              const SizedBox(height: 16),

              // Default State Dropdown
              DropdownButtonFormField<String>(
                value: _defaultState,
                decoration: const InputDecoration(
                  labelText: 'Default State',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'off', child: Text('Off')),
                  DropdownMenuItem(value: 'on', child: Text('On')),
                ]
                    .map((item) => DropdownMenuItem<String>(
                          value: item.value,
                          child: item.child,
                        ))
                    .toList(),
                onChanged: (value) {
                  if (value != null) {
                    setState(() => _defaultState = value);
                  }
                },
              ),
              const SizedBox(height: 16),

              // Description
              TextFormField(
                controller: _descriptionController,
                decoration: const InputDecoration(
                  labelText: 'Description (Optional)',
                  border: OutlineInputBorder(),
                ),
                maxLines: 2,
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _isLoading ? null : _handleUpdateRelay,
          child: _isLoading
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Update'),
        ),
      ],
    );
  }

  Future<void> _handleUpdateRelay() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);
    try {
      await ref
          .read(relayConfigNotifierProvider(widget.deviceId).notifier)
          .updateRelay(
            widget.relay.id,
            relayName: _nameController.text,
            gpioPin: int.parse(_gpioController.text),
            activeLevel: _activeLevel,
            defaultState: _defaultState,
            description: _descriptionController.text.isEmpty
                ? null
                : _descriptionController.text,
          );

      if (mounted) {
        widget.onRelayUpdated();
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Relay updated successfully'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to update relay: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }
}
