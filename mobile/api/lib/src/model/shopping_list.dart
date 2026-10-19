//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:openapi/src/model/shopping_list_item.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'shopping_list.g.dart';

/// ShoppingList
///
/// Properties:
/// * [id] 
/// * [createdAt] 
/// * [updatedAt] 
/// * [createdBy] 
/// * [groupId] - Group the list belongs to
/// * [name] - List name, e.g. Supermarket
/// * [items] - The list's items, ordered by creation. Always an array, never null.
@BuiltValue()
abstract class ShoppingList implements Built<ShoppingList, ShoppingListBuilder> {
  @BuiltValueField(wireName: r'id')
  int get id;

  @BuiltValueField(wireName: r'createdAt')
  DateTime? get createdAt;

  @BuiltValueField(wireName: r'updatedAt')
  DateTime? get updatedAt;

  @BuiltValueField(wireName: r'createdBy')
  int? get createdBy;

  /// Group the list belongs to
  @BuiltValueField(wireName: r'groupId')
  int get groupId;

  /// List name, e.g. Supermarket
  @BuiltValueField(wireName: r'name')
  String get name;

  /// The list's items, ordered by creation. Always an array, never null.
  @BuiltValueField(wireName: r'items')
  BuiltList<ShoppingListItem> get items;

  ShoppingList._();

  factory ShoppingList([void updates(ShoppingListBuilder b)]) = _$ShoppingList;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ShoppingListBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ShoppingList> get serializer => _$ShoppingListSerializer();
}

class _$ShoppingListSerializer implements PrimitiveSerializer<ShoppingList> {
  @override
  final Iterable<Type> types = const [ShoppingList, _$ShoppingList];

  @override
  final String wireName = r'ShoppingList';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ShoppingList object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(int),
    );
    if (object.createdAt != null) {
      yield r'createdAt';
      yield serializers.serialize(
        object.createdAt,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.updatedAt != null) {
      yield r'updatedAt';
      yield serializers.serialize(
        object.updatedAt,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.createdBy != null) {
      yield r'createdBy';
      yield serializers.serialize(
        object.createdBy,
        specifiedType: const FullType(int),
      );
    }
    yield r'groupId';
    yield serializers.serialize(
      object.groupId,
      specifiedType: const FullType(int),
    );
    yield r'name';
    yield serializers.serialize(
      object.name,
      specifiedType: const FullType(String),
    );
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(ShoppingListItem)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ShoppingList object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ShoppingListBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.id = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        case r'updatedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.updatedAt = valueDes;
          break;
        case r'createdBy':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.createdBy = valueDes;
          break;
        case r'groupId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.groupId = valueDes;
          break;
        case r'name':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.name = valueDes;
          break;
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(ShoppingListItem)]),
          ) as BuiltList<ShoppingListItem>;
          result.items.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ShoppingList deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ShoppingListBuilder();
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

