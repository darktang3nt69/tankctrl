/// Relay configuration domain model
library;

/// Relay GPIO configuration
class RelayConfig {
  final String id;
  final String deviceId;
  final String relayName;
  final int gpioPin;
  final String activeLevel; // "LOW" or "HIGH"
  final String defaultState; // "on" or "off"
  final String? description;
  final DateTime createdAt;
  final DateTime updatedAt;

  const RelayConfig({
    required this.id,
    required this.deviceId,
    required this.relayName,
    required this.gpioPin,
    required this.activeLevel,
    required this.defaultState,
    this.description,
    required this.createdAt,
    required this.updatedAt,
  });

  factory RelayConfig.fromJson(Map<String, dynamic> json) {
    return RelayConfig(
      id: json['id'] ?? '',
      deviceId: json['device_id'] ?? json['deviceId'] ?? '',
      relayName: json['relay_name'] ?? json['relayName'] ?? 'Relay',
      gpioPin: json['gpio_pin'] ?? json['gpioPin'] ?? 0,
      activeLevel: json['active_level'] ?? json['activeLevel'] ?? 'HIGH',
      defaultState: json['default_state'] ?? json['defaultState'] ?? 'off',
      description: json['description'],
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'])
          : DateTime.now(),
      updatedAt: json['updated_at'] != null
          ? DateTime.parse(json['updated_at'])
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'device_id': deviceId,
    'relay_name': relayName,
    'gpio_pin': gpioPin,
    'active_level': activeLevel,
    'default_state': defaultState,
    'description': description,
    'created_at': createdAt.toIso8601String(),
    'updated_at': updatedAt.toIso8601String(),
  };

  RelayConfig copyWith({
    String? id,
    String? deviceId,
    String? relayName,
    int? gpioPin,
    String? activeLevel,
    String? defaultState,
    String? description,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return RelayConfig(
      id: id ?? this.id,
      deviceId: deviceId ?? this.deviceId,
      relayName: relayName ?? this.relayName,
      gpioPin: gpioPin ?? this.gpioPin,
      activeLevel: activeLevel ?? this.activeLevel,
      defaultState: defaultState ?? this.defaultState,
      description: description ?? this.description,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  String toString() => 'RelayConfig(id: $id, name: $relayName, gpio: $gpioPin)';
}
