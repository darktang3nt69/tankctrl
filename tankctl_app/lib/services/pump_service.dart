import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tankctl_app/core/api/api_client.dart';

class PumpService {
  PumpService(this._dio);
  final Dio _dio;

  /// Gets the current pump state from the device shadow's reported field.
  Future<String> getPumpState(String deviceId) async {
    try {
      final response = await _dio.get('/devices/$deviceId/shadow');
      final reported = (response.data as Map<String, dynamic>)['reported'] as Map<String, dynamic>?;
      return reported?['pump'] as String? ?? 'off';
    } catch (e) {
      rethrow;
    }
  }

  /// Sends a set_pump command via POST /devices/{id}/pump.
  Future<void> setPumpState(String deviceId, String state) async {
    try {
      await _dio.post(
        '/devices/$deviceId/pump',
        data: {'state': state},
      );
    } catch (e) {
      rethrow;
    }
  }
}

final pumpServiceProvider = Provider<PumpService>(
  (ref) => PumpService(ref.watch(dioProvider)),
);
