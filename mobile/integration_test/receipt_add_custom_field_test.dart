// Flow #9 -- add a receipt with a custom field value.
//
// The custom-fields feature lets group admins define optional per-
// receipt fields (TEXT, DATE, SELECT, CURRENCY, BOOLEAN). The receipt
// form has an "Add Custom Field" button that opens a modal listing
// the available fields; selecting one adds it to the form, and the
// user fills the value before saving.
//
// Test prerequisite (one-time, manual via the desktop UI -- mirrors
// the e2e-admin/e2e-user seeding pattern):
//   * Create a TEXT-type custom field named "E2E Notes" on the admin
//     user's group ("My Receipts" by default).
// If it's missing, the test fails fast with a clear setup message.
//
// Own file for the GoRouter-persistence reason (see other test files).

import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:receipt_wrangler_mobile/shared/widgets/bottom_submit_button.dart';

import 'helpers/api.dart';
import 'helpers/form_actions.dart';
import 'helpers/login.dart';
import 'helpers/platform_mocks.dart';
import 'helpers/pump.dart';
import 'helpers/receipt_test_helpers.dart';

const _testFieldName = 'E2E Notes';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    if (Platform.isLinux) {
      installLinuxDesktopMocks();
    }
  });

  testWidgets('admin can add a receipt with a custom field value',
      (tester) async {
    await binding.setSurfaceSize(const Size(1280, 900));
    addTearDown(() => binding.setSurfaceSize(null));

    // Pre-flight: locate the seeded "E2E Notes" custom field.
    final jwt = await apiLogin();
    final fields = await listCustomFields(jwt: jwt);
    final notesField = fields.firstWhere(
      (f) => f['name'] == _testFieldName,
      orElse: () => throw StateError(
        'Test prerequisite missing: no custom field named "$_testFieldName"\n'
        'on the admin\'s group. Set up via the desktop UI:\n'
        '  1. Log in as admin\n'
        '  2. Navigate to custom fields administration\n'
        '  3. Create a TEXT-type field named "$_testFieldName"\n'
        'Then re-run this test.',
      ),
    );
    final fieldId = notesField['id'] as int;

    await loginAsAdmin(tester);

    final receiptName =
        'e2e-cf-${DateTime.now().millisecondsSinceEpoch}';
    final fieldValue =
        'note-${DateTime.now().millisecondsSinceEpoch}';

    await tester.tap(find.text('Add'));
    await pumpUntilFound(tester, find.text('Add Manual Receipt'));
    await tester.tap(find.text('Add Manual Receipt'));
    await pumpUntilFound(tester, find.text('Name'));

    // Fill required fields first -- the custom field add UI is below
    // the standard fields in the scroll view.
    await tester.enterText(formField('name'), receiptName);
    await tester.enterText(formField('amount'), '12.34');
    await selectDropdown(tester, 'groupId', 'My Receipts');
    await selectDropdown(tester, 'paidByUserId', 'ee');

    // Drain dropdown overlay teardown before tapping the Add Custom
    // Field button (the modal-bottom-sheet open / close interacts
    // with the same overlay routes the dropdowns used).
    await tester.pumpAndSettle(const Duration(seconds: 3));

    // Open the modal of available fields. The button text is exactly
    // "Add Custom Field" (mobile/lib/receipts/widgets/receipt_form.dart:248-279).
    final addCustomFieldBtn =
        find.widgetWithText(ElevatedButton, 'Add Custom Field');
    await tester.ensureVisible(addCustomFieldBtn);
    await tester.tap(addCustomFieldBtn);
    await pumpUntilFound(tester, find.text(_testFieldName));
    await tester.tap(find.text(_testFieldName));

    // The custom field widget mounts with name `customField_<id>`
    // (mobile/lib/shared/widgets/custom_field_widget.dart line ~47 for
    // TEXT type). Wait for it to render and fill it.
    await pumpUntilFound(tester, formField('customField_$fieldId'));
    await tester.enterText(
      formField('customField_$fieldId'),
      fieldValue,
    );

    // Save.
    await tester.pumpAndSettle(const Duration(seconds: 3));
    await tester.tap(find.byType(BottomSubmitButton));
    final url = await pumpUntilUrl(tester, RegExp(r'/receipts/\d+/view'));
    final receiptId = receiptIdFromUrl(url);
    scheduleReceiptCleanup(receiptId);

    // Verify via API: the receipt has a customFieldValue with our id
    // and value.
    final receipt = await getReceipt(receiptId, jwt: jwt);
    final customFieldValues = (receipt['customFields'] as List?) ?? const [];
    final match = customFieldValues.cast<Map<String, dynamic>>().firstWhere(
          (cf) =>
              cf['customFieldId'] == fieldId &&
              cf['stringValue'] == fieldValue,
          orElse: () => <String, dynamic>{},
        );
    expect(
      match.isNotEmpty,
      isTrue,
      reason:
          'Receipt should have a custom-field value for "$_testFieldName" '
          '(id=$fieldId) equal to "$fieldValue". Got: $customFieldValues',
    );
  });
}
