//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'group_overview_category.g.dart';

/// GroupOverviewCategory
///
/// Properties:
/// * [name] 
/// * [total] 
@BuiltValue()
abstract class GroupOverviewCategory implements Built<GroupOverviewCategory, GroupOverviewCategoryBuilder> {
  @BuiltValueField(wireName: r'name')
  String get name;

  @BuiltValueField(wireName: r'total')
  String get total;

  GroupOverviewCategory._();

  factory GroupOverviewCategory([void updates(GroupOverviewCategoryBuilder b)]) = _$GroupOverviewCategory;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(GroupOverviewCategoryBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<GroupOverviewCategory> get serializer => _$GroupOverviewCategorySerializer();
}

class _$GroupOverviewCategorySerializer implements PrimitiveSerializer<GroupOverviewCategory> {
  @override
  final Iterable<Type> types = const [GroupOverviewCategory, _$GroupOverviewCategory];

  @override
  final String wireName = r'GroupOverviewCategory';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    GroupOverviewCategory object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'name';
    yield serializers.serialize(
      object.name,
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
    GroupOverviewCategory object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required GroupOverviewCategoryBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'name':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.name = valueDes;
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
  GroupOverviewCategory deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = GroupOverviewCategoryBuilder();
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

