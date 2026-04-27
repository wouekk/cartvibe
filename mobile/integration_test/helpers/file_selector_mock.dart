import 'dart:typed_data';

import 'package:file_selector_platform_interface/file_selector_platform_interface.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';

/// Replaces [FileSelectorPlatform.instance] with a stub that returns a
/// fixed in-memory file from [openFiles]. Lets tests exercise the receipt
/// form's "Upload from Gallery" path without driving a native picker.
///
/// The platform-interface swap works on every target Flutter supports, so
/// this is the same code path on Linux desktop, Android emulator, and
/// iOS simulator. Unlike a per-platform method-channel mock, we don't
/// have to discover three different channel names.
///
/// `MockPlatformInterfaceMixin` is what lets a test class extend
/// `FileSelectorPlatform` -- without it, `PlatformInterface.verify()`
/// rejects the swap.
class _FakeFileSelector extends FileSelectorPlatform
    with MockPlatformInterfaceMixin {
  _FakeFileSelector(this._bytes, this._name);

  final Uint8List _bytes;
  final String _name;

  @override
  Future<List<XFile>> openFiles({
    List<XTypeGroup>? acceptedTypeGroups,
    String? initialDirectory,
    String? confirmButtonText,
  }) async {
    return <XFile>[
      XFile.fromData(_bytes, name: _name, mimeType: 'image/png'),
    ];
  }
}

void installFileSelectorMock({Uint8List? bytes, String name = 'sample.png'}) {
  FileSelectorPlatform.instance =
      _FakeFileSelector(bytes ?? Uint8List.fromList(_kPng1x1Bytes), name);
}

/// 67-byte 1x1 transparent PNG. Smallest valid PNG that the Go API will
/// accept as an image upload. Inlined so tests don't need a tracked
/// asset file (which would have to be added to pubspec.yaml's assets
/// list and would ship in production builds).
const List<int> _kPng1x1Bytes = <int>[
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
  0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
  0x42, 0x60, 0x82,
];
