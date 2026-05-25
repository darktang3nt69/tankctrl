import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tankctl_app/core/api/api_client.dart';
import 'package:tankctl_app/domain/relay_config.dart';

class RelayConfigService {
  RelayConfigService(this._dio);
  final Dio _dio;

  /// Get all relay configurations for a device
  Future<List<RelayConfig>> getDeviceRelays(String deviceId) async {
    try {
      final response = await _dio.get('/devices/$deviceId/relays');
      final relays = response.data as List<dynamic>? ?? [];
      return relays
          .map((json) => RelayConfig.fromJson(json as Map<String, dynamic>))
          .toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Get a single relay configuration
  Future<RelayConfig> getRelay(String deviceId, String relayId) async {
    try {
      final response = await _dio.get('/devices/$deviceId/relays/$relayId');
      return RelayConfig.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      rethrow;
    }
  }

  /// Create a new relay configuration
  Future<RelayConfig> createRelay(String deviceId, {
    required String relayName,
    required int gpioPin,
    required String activeLevel,
    required String defaultState,
    String? description,
  }) async {
    try {
      final response = await _dio.post(
        '/devices/$deviceId/relays',
        data: {
          'relay_name': relayName,
          'gpio_pin': gpioPin,
          'active_level': activeLevel,
          'default_state': defaultState,
          'description': description,
        },
      );
      return RelayConfig.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      rethrow;
    }
  }

  /// Update a relay configuration
  Future<RelayConfig> updateRelay(String deviceId, String relayId, {
    String? relayName,
    int? gpioPin,
    String? activeLevel,
    String? defaultState,
    String? description,
  }) async {
    try {
      final data = <String, dynamic>{};
      if (relayName != null) data['relay_name'] = relayName;
      if (gpioPin != null) data['gpio_pin'] = gpioPin;
      if (activeLevel != null) data['active_level'] = activeLevel;
      if (defaultState != null) data['default_state'] = defaultState;
      if (description != null) data['description'] = description;

      final response = await _dio.put(
        '/devices/$deviceId/relays/$relayId',
        data: data,
      );
      return RelayConfig.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      rethrow;
    }
  }

  /// Delete a relay configuration
  Future<void> deleteRelay(String deviceId, String relayId) async {
    try {
      await _dio.delete('/devices/$deviceId/relays/$relayId');
    } catch (e) {
      rethrow;
    }
  }
}

final relayConfigServiceProvider = Provider<RelayConfigService>(
  (ref) => RelayConfigService(ref.watch(dioProvider)),
);
