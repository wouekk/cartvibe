import 'package:test/test.dart';
import 'package:openapi/openapi.dart';


/// tests for OverviewApi
void main() {
  final instance = Openapi().getOverviewApi();

  group(OverviewApi, () {
    // Get the group's month at a glance
    //
    // This will get a month's spend, receipt counts, spending by category and the six-month trend ending with it, over the receipts the caller can see [group.receipts.read]
    //
    //Future<GroupOverview> getGroupOverview(int groupId, { String month }) async
    test('test getGroupOverview', () async {
      // TODO
    });

  });
}
