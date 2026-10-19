//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'group_overview_month.g.dart';

/// GroupOverviewMonth
///
/// Properties:
/// * [month] - yyyy-MM
/// * [total] 
@BuiltValue()
abstract class GroupOverviewMonth implements Built<GroupOverviewMonth, GroupOverviewMonthBuilder> {
  /// yyyy-MM
  @BuiltValueField(wireName: r'month')
  String get month;

  @BuiltValueField(wireName: r'total')
  String get total;

  GroupOverviewMonth._();

  factory GroupOverviewMonth([void updates(GroupOverviewMonthBuilder b)]) = _$GroupOverviewMonth;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(GroupOverviewMonthBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<GroupOverviewMonth> get serializer => _$GroupOverviewMonthSerializer();
}

class _$GroupOverviewMonthSerializer implements PrimitiveSerializer<GroupOverviewMonth> {
  @override
  final Iterable<Type> types = const [GroupOverviewMonth, _$GroupOverviewMonth];

  @override
  final String wireName = r'GroupOverviewMonth';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    GroupOverviewMonth object, {
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
  }

  @override
  Object serialize(
    Serializers serializers,
    GroupOverviewMonth object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required GroupOverviewMonthBuilder result,
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
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  GroupOverviewMonth deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = GroupOverviewMonthBuilder();
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

