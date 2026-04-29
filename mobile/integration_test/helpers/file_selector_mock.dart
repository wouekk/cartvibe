import 'dart:typed_data';

import 'package:file_selector_platform_interface/file_selector_platform_interface.dart';
import 'package:flutter/services.dart' show rootBundle;
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

/// Loads `assets/test/sample.png` and installs a fake file-selector that
/// returns it from `openFiles`. The bundled asset (16x16 RGBA PNG, ~300B)
/// is shipped with the app so `rootBundle.load` works at runtime on every
/// target. Pass `bytes` to override with a different fixture.
Future<void> installFileSelectorMock({
  Uint8List? bytes,
  String name = 'sample.png',
}) async {
  final pngBytes = bytes ??
      (await rootBundle.load('assets/test/sample.png'))
          .buffer
          .asUint8List();
  FileSelectorPlatform.instance = _FakeFileSelector(pngBytes, name);
}
