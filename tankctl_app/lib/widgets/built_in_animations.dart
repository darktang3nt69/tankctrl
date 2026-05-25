import 'package:flutter/material.dart';

/// Loader animation
class BuiltInLoader extends StatelessWidget {
  const BuiltInLoader({super.key});
  @override
  Widget build(BuildContext context) => const Center(
    child: CircularProgressIndicator(),
  );
}

/// Animated transition between widgets
class BuiltInAnimatedSwitcher extends StatelessWidget {
  final Widget child;
  const BuiltInAnimatedSwitcher({required this.child, super.key});
  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
    duration: const Duration(milliseconds: 400),
    child: child,
  );
}

/// Warning chip with fade animation
class BuiltInWarningChip extends StatefulWidget {
  final bool visible;
  final String label;
  const BuiltInWarningChip({required this.visible, required this.label, super.key});
  @override
  State<BuiltInWarningChip> createState() => _BuiltInWarningChipState();
}

class _BuiltInWarningChipState extends State<BuiltInWarningChip> {
  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      opacity: widget.visible ? 1.0 : 0.0,
      duration: const Duration(milliseconds: 300),
      child: Chip(
        label: Text(widget.label),
        backgroundColor: Colors.orange,
        avatar: const Icon(Icons.warning, color: Colors.white),
      ),
    );
  }
}

/// Notification with fade animation
class BuiltInNotification extends StatefulWidget {
  final bool visible;
  final String message;
  final bool success;
  const BuiltInNotification({required this.visible, required this.message, required this.success, super.key});
  @override
  State<BuiltInNotification> createState() => _BuiltInNotificationState();
}

class _BuiltInNotificationState extends State<BuiltInNotification> {
  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      opacity: widget.visible ? 1.0 : 0.0,
      duration: const Duration(milliseconds: 300),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: widget.success ? Colors.green : Colors.red,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(widget.success ? Icons.check_circle : Icons.error, color: Colors.white),
            const SizedBox(width: 8),
            Text(widget.message, style: const TextStyle(color: Colors.white)),
          ],
        ),
      ),
    );
  }
}

/// Empty state with fade and scale animation
class BuiltInEmptyState extends StatefulWidget {
  final bool visible;
  final String message;
  const BuiltInEmptyState({required this.visible, required this.message, super.key});
  @override
  State<BuiltInEmptyState> createState() => _BuiltInEmptyStateState();
}

class _BuiltInEmptyStateState extends State<BuiltInEmptyState> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );
    _scale = Tween<double>(begin: 0.8, end: 1.0).animate(_controller);
    if (widget.visible) _controller.forward();
  }

  @override
  void didUpdateWidget(covariant BuiltInEmptyState oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.visible) {
      _controller.forward();
    } else {
      _controller.reverse();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _controller,
      child: ScaleTransition(
        scale: _scale,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.inbox, size: 48, color: Colors.grey),
            const SizedBox(height: 8),
            Text(widget.message, style: const TextStyle(color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}

/// Quick action with scale animation
class BuiltInQuickAction extends StatefulWidget {
  final bool active;
  final IconData icon;
  final String label;
  const BuiltInQuickAction({required this.active, required this.icon, required this.label, super.key});
  @override
  State<BuiltInQuickAction> createState() => _BuiltInQuickActionState();
}

class _BuiltInQuickActionState extends State<BuiltInQuickAction> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _scale = Tween<double>(begin: 0.8, end: 1.0).animate(_controller);
    if (widget.active) _controller.forward();
  }

  @override
  void didUpdateWidget(covariant BuiltInQuickAction oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active) {
      _controller.forward();
    } else {
      _controller.reverse();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scale,
      child: ElevatedButton.icon(
        icon: Icon(widget.icon),
        label: Text(widget.label),
        onPressed: widget.active ? () {} : null,
      ),
    );
  }
}

/// Device status with color and fade animation
class BuiltInDeviceStatus extends StatelessWidget {
  final String status; // 'healthy', 'warning', 'offline'
  const BuiltInDeviceStatus({required this.status, super.key});
  @override
  Widget build(BuildContext context) {
    Color color;
    IconData icon;
    switch (status) {
      case 'healthy':
        color = Colors.green;
        icon = Icons.check_circle;
        break;
      case 'warning':
        color = Colors.orange;
        icon = Icons.warning;
        break;
      case 'offline':
        color = Colors.red;
        icon = Icons.cancel;
        break;
      default:
        color = Colors.grey;
        icon = Icons.device_unknown;
    }
    return AnimatedOpacity(
      opacity: 1.0,
      duration: const Duration(milliseconds: 300),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 8),
          Text(status, style: TextStyle(color: color)),
        ],
      ),
    );
  }
}