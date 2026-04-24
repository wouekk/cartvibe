import 'package:flutter/cupertino.dart';
import 'package:flutter_form_builder/flutter_form_builder.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:receipt_wrangler_mobile/groups/screens/group_select.dart';
import 'package:receipt_wrangler_mobile/main.dart' as app;

import 'helpers/env.dart';
import 'helpers/platform_mocks.dart';
import 'helpers/pump.dart';

Finder _formField(String name) => find.byWidgetPredicate(
      (w) => w is FormBuilderTextField && w.name == name,
    );

Finder _filledButton(String text) =>
    find.widgetWithText(CupertinoButton, text);

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  installLinuxDesktopMocks();

  testWidgets('admin can log in from a cold boot', (tester) async {
    E2eEnv.assertAdmin();

    app.main();
    await pumpUntilFound(tester, find.text('Server URL'));

    await tester.enterText(_formField('url'), E2eEnv.baseUrl);
    await tester.tap(_filledButton('Connect'));
    await pumpUntilFound(tester, find.text('Log In'));

    await tester.enterText(_formField('username'), E2eEnv.adminUsername);
    await tester.enterText(_formField('password'), E2eEnv.adminPassword);
    await tester.tap(_filledButton('Log In'));

    await pumpUntilFound(
      tester,
      find.byType(GroupSelect),
      timeout: const Duration(seconds: 15),
    );
  });
}
