// Flow B -- verifies bug-fix #2 (partial image upload reporting).
//
// The bug: `addReceipt` used to show a green "Receipt added
// successfully" snackbar BEFORE Future.wait on the image uploads. If
// any upload failed, the user saw the success snackbar followed by a
// red error one, the receipt existed server-side with no/partial
// images, and the navigation to /view never happened.
//
// The fix moves the success snackbar AFTER Future.wait and, on
// partial failure, shows a clear "Receipt added, but one or more
// images failed to upload. Open the receipt to retry." snackbar AND
// still navigates to /view so the user can retry uploads.
//
// This test:
//  1. Mocks file_selector to return a 1x1 PNG.
//  2. Installs a dio interceptor that rejects POSTs to /receiptImage
//     with HTTP 500 (helpers/dio_failure_injection.dart).
//  3. Drives the receipt-add flow with one image attached.
//  4. Asserts the partial-failure snackbar appeared, the user landed
//     on /receipts/<id>/view, and the receipt has 0 imageFiles
//     server-side.
//
// Skipped on Linux: scan.dart's gallery picker only supports
// Android/iOS (same as Flow 2). Runs on Android emulator + iOS sim
// in CI.

import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:receipt_wrangler_mobile/shared/widgets/bottom_submit_button.dart';

import 'helpers/api.dart';
import 'helpers/dio_failure_injection.dart';
import 'helpers/file_selector_mock.dart';
import 'helpers/form_actions.dart';
import 'helpers/login.dart';
import 'helpers/platform_mocks.dart';
import 'helpers/pump.dart';
import 'helpers/receipt_test_helpers.dart';
import 'helpers/users.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    if (Platform.isLinux) {
      installLinuxDesktopMocks();
    }
  });

  testWidgets(
      'image upload failure: partial-failure snackbar shown, receipt still created',
      // Same Linux skip as Flow 2 -- scan.dart:58 throws
      // "Unsupported platform" for the gallery picker on Linux.
      skip: Platform.isLinux,
      (tester) async {
    installFileSelectorMock();
    await binding.setSurfaceSize(const Size(1280, 900));
    addTearDown(() => binding.setSurfaceSize(null));

    await loginAsAdmin(tester);
    // MUST run after loginAsAdmin -- login rebuilds OpenApiClient.client.dio.
    installFailReceiptImageUpload();

    final receiptName =
        'e2e-partial-${DateTime.now().millisecondsSinceEpoch}';

    await tester.tap(find.text('Add'));
    await pumpUntilFound(tester, find.text('Add Manual Receipt'));
    await tester.tap(find.text('Add Manual Receipt'));
    await pumpUntilFound(tester, find.text('Name'));

    // Open the Images sub-screen + attach the mocked image. Tap the
    // Tooltip wrapper (mobile/lib/receipts/widgets/receipt_form.dart:411)
    // instead of the inner Text -- the Text's tap center can miss the
    // InkWell hit-test region on narrow viewports.
    final imagesButton = find.byTooltip('View Images');
    await tester.ensureVisible(imagesButton);
    await tester.pump();
    await tester.tap(imagesButton);
    await pumpUntilFound(tester, find.byIcon(Icons.more_vert));
    await tester.tap(find.byIcon(Icons.more_vert));
    await pumpUntilFound(tester, find.text('Upload from Gallery'));
    await tester.tap(find.text('Upload from Gallery'));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    await tester.tap(find.byIcon(Icons.arrow_back));
    await pumpUntilFound(tester, find.text('Name'));

    await tester.enterText(formField('name'), receiptName);
    await tester.enterText(formField('amount'), '12.34');
    await selectDropdown(tester, 'groupId', 'My Receipts');
    await selectDropdown(tester, 'paidByUserId', adminDisplayName(tester));

    await tester.pumpAndSettle(const Duration(seconds: 3));
    await tester.tap(find.byType(BottomSubmitButton));

    // Production path: createReceipt succeeds -> Future.wait on image
    // uploads throws (our injector) -> showErrorSnackbar(...) -> go to
    // /view. So we should see the partial-failure snackbar AND land on
    // /view. Wait for the snackbar text first since it appears slightly
    // before the navigation in the production code.
    await pumpUntilFound(
      tester,
      find.textContaining('one or more images failed to upload'),
      timeout: const Duration(seconds: 15),
    );
    final url = await pumpUntilUrl(tester, RegExp(r'/receipts/\d+/view'));
    final receiptId = receiptIdFromUrl(url);
    scheduleReceiptCleanup(receiptId);

    // Server-side: the receipt was created, but with no images.
    final jwt = await apiLogin();
    final receipt = await getReceipt(receiptId, jwt: jwt);
    final imageFiles = receipt['imageFiles'] as List?;
    expect(
      imageFiles?.length ?? 0,
      0,
      reason: 'Image upload failure injection should leave the receipt '
          'with zero imageFiles. Got ${imageFiles?.length ?? 0}.',
    );
  });
}
