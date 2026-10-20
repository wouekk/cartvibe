//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:openapi/src/model/group_overview_month.dart';
import 'package:openapi/src/model/group_overview_category.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'group_overview.g.dart';

/// GroupOverview
///
/// Properties:
/// * [month] - The month described, yyyy-MM
/// * [total] - The month's spend, as a decimal string
/// * [previousTotal] - The previous month's spend, as a decimal string
/// * [receiptCount] 
/// * [openReceiptCount] - The month's receipts still to check (OPEN, NEEDS_ATTENTION or DRAFT)
/// * [unhealthyTotal] - What the month's products rated UNHEALTHY cost, as a decimal string, whatever the receipt's category. Products without a price or not rated yet do not count.
/// * [categories] - Spend per category in the month, largest first. A receipt counts toward each of its categories, so these can add up to more than the total. Always an array.
/// * [months] - The six months ending with month, oldest first; a month without receipts is a zero
@BuiltValue()
abstract class GroupOverview implements Built<GroupOverview, GroupOverviewBuilder> {
  /// The month described, yyyy-MM
  @BuiltValueField(wireName: r'month')
  String get month;

  /// The month's spend, as a decimal string
  @BuiltValueField(wireName: r'total')
  String get total;

  /// The previous month's spend, as a decimal string
  @BuiltValueField(wireName: r'previousTotal')
  String get previousTotal;

  @BuiltValueField(wireName: r'receiptCount')
  int get receiptCount;

  /// The month's receipts still to check (OPEN, NEEDS_ATTENTION or DRAFT)
  @BuiltValueField(wireName: r'openReceiptCount')
  int get openReceiptCount;

  /// What the month's products rated UNHEALTHY cost, as a decimal string, whatever the receipt's category. Products without a price or not rated yet do not count.
  @BuiltValueField(wireName: r'unhealthyTotal')
  String get unhealthyTotal;

  /// Spend per category in the month, largest first. A receipt counts toward each of its categories, so these can add up to more than the total. Always an array.
  @BuiltValueField(wireName: r'categories')
  BuiltList<GroupOverviewCategory> get categories;

  /// The six months ending with month, oldest first; a month without receipts is a zero
  @BuiltValueField(wireName: r'months')
  BuiltList<GroupOverviewMonth> get months;

  GroupOverview._();

  factory GroupOverview([void updates(GroupOverviewBuilder b)]) = _$GroupOverview;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(GroupOverviewBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<GroupOverview> get serializer => _$GroupOverviewSerializer();
}

class _$GroupOverviewSerializer implements PrimitiveSerializer<GroupOverview> {
  @override
  final Iterable<Type> types = const [GroupOverview, _$GroupOverview];

  @override
  final String wireName = r'GroupOverview';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    GroupOverview object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'month';
    yield serializers.serialize(
      object.month,
      specifiedType: const FullType(String),
    );
    yield r'total';
    yield serializers.serialize(
      object.total,
      specifiedType: const FullType(String),
    );
    yield r'previousTotal';
    yield serializers.serialize(
      object.previousTotal,
      specifiedType: const FullType(String),
    );
    yield r'receiptCount';
    yield serializers.serialize(
      object.receiptCount,
      specifiedType: const FullType(int),
    );
    yield r'openReceiptCount';
    yield serializers.serialize(
      object.openReceiptCount,
      specifiedType: const FullType(int),
    );
    yield r'unhealthyTotal';
    yield serializers.serialize(
      object.unhealthyTotal,
      specifiedType: const FullType(String),
    );
    yield r'categories';
    yield serializers.serialize(
      object.categories,
      specifiedType: const FullType(BuiltList, [FullType(GroupOverviewCategory)]),
    );
    yield r'months';
    yield serializers.serialize(
      object.months,
      specifiedType: const FullType(BuiltList, [FullType(GroupOverviewMonth)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    GroupOverview object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required GroupOverviewBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'month':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.month = valueDes;
          break;
        case r'total':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.total = valueDes;
          break;
        case r'previousTotal':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.previousTotal = valueDes;
          break;
        case r'receiptCount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.receiptCount = valueDes;
          break;
        case r'openReceiptCount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.openReceiptCount = valueDes;
          break;
        case r'unhealthyTotal':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.unhealthyTotal = valueDes;
          break;
        case r'categories':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(GroupOverviewCategory)]),
          ) as BuiltList<GroupOverviewCategory>;
          result.categories.replace(valueDes);
          break;
        case r'months':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(GroupOverviewMonth)]),
          ) as BuiltList<GroupOverviewMonth>;
          result.months.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  GroupOverview deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = GroupOverviewBuilder();
    final serializedList = (serialized as Iterable<Object?>).toList();
    final unhandled = <Object?>[];
    _deserializeProperties(
      serializers,
      serialized,
      specifiedType: specifiedType,
      serializedList: serializedList,
      unhandled: unhandled,
      result: result,
    );
    return result.build();
  }
}

