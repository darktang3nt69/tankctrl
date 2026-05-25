import 'package:flutter/material.dart';
import 'package:rive/rive.dart';

/// Dashboard loading animation
class RiveDashboardLoading extends StatelessWidget {
  const RiveDashboardLoading({super.key});
  @override
  Widget build(BuildContext context) => const RiveAnimation.asset('assets/rive/dashboard_loading.riv');
}

/// Update available/install prompt animation
class RiveUpdatePrompt extends StatelessWidget {
  const RiveUpdatePrompt({super.key});
  @override
  Widget build(BuildContext context) => const RiveAnimation.asset('assets/rive/update_prompt.riv');
}

/// Tank card health/warning/offline animation
class RiveTankStatus extends StatelessWidget {
  final String status; // 'healthy', 'warning', 'offline'
  const RiveTankStatus({required this.status, super.key});
  @override
  Widget build(BuildContext context) => RiveAnimation.asset('assets/rive/tank_status_$status.riv');
}

/// Splash screen animation
class RiveSplashScreen extends StatelessWidget {
  const RiveSplashScreen({super.key});
  @override
  Widget build(BuildContext context) => const RiveAnimation.asset('assets/rive/splash.riv');
}

/// Settings feedback animation
class RiveSettingsFeedback extends StatelessWidget {
  final bool success;
  const RiveSettingsFeedback({required this.success, super.key});
  @override
  Widget build(BuildContext context) => RiveAnimation.asset(success ? 'assets/rive/settings_success.riv' : 'assets/rive/settings_error.riv');
}

/// Connection quality animation
class RiveConnectionQuality extends StatelessWidget {
  final String quality; // 'strong', 'medium', 'weak', 'offline'
  const RiveConnectionQuality({required this.quality, super.key});
  @override
  Widget build(BuildContext context) => RiveAnimation.asset('assets/rive/connection_$quality.riv');
}

/// Quick action animation
class RiveQuickAction extends StatelessWidget {
  final String action; // 'pump', 'light'
  const RiveQuickAction({required this.action, super.key});
  @override
  Widget build(BuildContext context) => RiveAnimation.asset('assets/rive/quick_$action.riv');
}

/// Warning chip animation
class RiveWarningChip extends StatelessWidget {
  const RiveWarningChip({super.key});
  @override
  Widget build(BuildContext context) => const RiveAnimation.asset('assets/rive/warning_chip.riv');
}

/// Empty state animation
class RiveEmptyState extends StatelessWidget {
  const RiveEmptyState({super.key});
  @override
  Widget build(BuildContext context) => const RiveAnimation.asset('assets/rive/empty_state.riv');
}

/// Firmware update progress animation
class RiveFirmwareUpdate extends StatelessWidget {
  const RiveFirmwareUpdate({super.key});
  @override
  Widget build(BuildContext context) => const RiveAnimation.asset('assets/rive/firmware_update.riv');
}

/// Sidebar/menu transition animation
class RiveSidebarTransition extends StatelessWidget {
  const RiveSidebarTransition({super.key});
  @override
  Widget build(BuildContext context) => const RiveAnimation.asset('assets/rive/sidebar_transition.riv');
}

/// Success/error notification animation
class RiveNotification extends StatelessWidget {
  final bool success;
  const RiveNotification({required this.success, super.key});
  @override
  Widget build(BuildContext context) => RiveAnimation.asset(success ? 'assets/rive/notification_success.riv' : 'assets/rive/notification_error.riv');
}

/// Device offline animation
class RiveDeviceOffline extends StatelessWidget {
  const RiveDeviceOffline({super.key});
  @override
  Widget build(BuildContext context) => const RiveAnimation.asset('assets/rive/device_offline.riv');
}

/// Telemetry chart animation
class RiveTelemetryChart extends StatelessWidget {
  const RiveTelemetryChart({super.key});
  @override
  Widget build(BuildContext context) => const RiveAnimation.asset('assets/rive/telemetry_chart.riv');
}

/// Onboarding/tutorial animation
class RiveOnboarding extends StatelessWidget {
  const RiveOnboarding({super.key});
  @override
  Widget build(BuildContext context) => const RiveAnimation.asset('assets/rive/onboarding.riv');
}
