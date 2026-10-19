import 'package:test/test.dart';
import 'package:openapi/openapi.dart';

// tests for GroupOverview
void main() {
  final instance = GroupOverviewBuilder();
  // TODO add properties to the builder and call build()

  group(GroupOverview, () {
    // The month described, yyyy-MM
    // String month
    test('to test the property `month`', () async {
      // TODO
    });

    // The month's spend, as a decimal string
    // String total
    test('to test the property `total`', () async {
      // TODO
    });

    // The previous month's spend, as a decimal string
    // String previousTotal
    test('to test the property `previousTotal`', () async {
      // TODO
    });

    // int receiptCount
    test('to test the property `receiptCount`', () async {
      // TODO
    });

    // The month's receipts still needing action (OPEN or NEEDS_ATTENTION)
    // int openReceiptCount
    test('to test the property `openReceiptCount`', () async {
      // TODO
    });

    // Spend per category in the month, largest first. A receipt counts toward each of its categories, so these can add up to more than the total. Always an array.
    // BuiltList<GroupOverviewCategory> categories
    test('to test the property `categories`', () async {
      // TODO
    });

    // The six months ending with month, oldest first; a month without receipts is a zero
    // BuiltList<GroupOverviewMonth> months
    test('to test the property `months`', () async {
      // TODO
    });

  });
}
