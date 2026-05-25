import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tankctl_app/services/pump_service.dart';

/// Per-device pump notifier used by pump toggle widget.
class PumpFamilyNotifier extends FamilyAsyncNotifier<String, String> {
  @override
  Future<String> build(String deviceId) {
    return ref.watch(pumpServiceProvider).getPumpState(deviceId);
  }

  /// Toggle pump state between 'on' and 'off'
  Future<void> toggle() async {
    final currentState = state.value ?? 'off';
    final newState = currentState == 'on' ? 'off' : 'on';
    await setPumpState(newState);
  }

  /// Set pump to specific state
  Future<void> setPumpState(String newState) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      await ref.read(pumpServiceProvider).setPumpState(arg, newState);
      return newState;
    });
  }
}

final pumpStateFamilyProvider = AsyncNotifierProviderFamily<
    PumpFamilyNotifier, String, String>(PumpFamilyNotifier.new);
