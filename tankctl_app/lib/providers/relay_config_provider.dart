import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tankctl_app/domain/relay_config.dart';
import 'package:tankctl_app/services/relay_config_service.dart';

/// Get all relays for a device
final relayConfigListProvider =
    FutureProvider.family<List<RelayConfig>, String>((ref, deviceId) async {
  final service = ref.watch(relayConfigServiceProvider);
  return service.getDeviceRelays(deviceId);
});

/// Get a single relay configuration
final relayConfigProvider = FutureProvider.family<RelayConfig, (String, String)>(
  (ref, args) async {
    final (deviceId, relayId) = args;
    final service = ref.watch(relayConfigServiceProvider);
    return service.getRelay(deviceId, relayId);
  },
);

/// Notifier for relay configuration operations
class RelayConfigNotifier extends FamilyAsyncNotifier<void, String> {
  @override
  Future<void> build(String deviceId) async {}

  /// Create a new relay
  Future<void> createRelay({
    required String relayName,
    required int gpioPin,
    required String activeLevel,
    required String defaultState,
    String? description,
  }) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final service = ref.read(relayConfigServiceProvider);
      await service.createRelay(
        arg,
        relayName: relayName,
        gpioPin: gpioPin,
        activeLevel: activeLevel,
        defaultState: defaultState,
        description: description,
      );
      // Refresh the list after creation
      ref.invalidate(relayConfigListProvider(arg));
    });
  }

  /// Update a relay
  Future<void> updateRelay(
    String relayId, {
    String? relayName,
    int? gpioPin,
    String? activeLevel,
    String? defaultState,
    String? description,
  }) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final service = ref.read(relayConfigServiceProvider);
      await service.updateRelay(
        arg,
        relayId,
        relayName: relayName,
        gpioPin: gpioPin,
        activeLevel: activeLevel,
        defaultState: defaultState,
        description: description,
      );
      // Refresh the list and specific relay after update
      ref.invalidate(relayConfigListProvider(arg));
    });
  }

  /// Delete a relay
  Future<void> deleteRelay(String relayId) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final service = ref.read(relayConfigServiceProvider);
      await service.deleteRelay(arg, relayId);
      // Refresh the list after deletion
      ref.invalidate(relayConfigListProvider(arg));
    });
  }
}

final relayConfigNotifierProvider =
    AsyncNotifierProviderFamily<RelayConfigNotifier, void, String>(
  RelayConfigNotifier.new,
);
