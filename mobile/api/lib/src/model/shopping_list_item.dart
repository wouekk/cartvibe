//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'shopping_list_item.g.dart';

/// ShoppingListItem
///
/// Properties:
/// * [id] 
/// * [createdAt] 
/// * [updatedAt] 
/// * [createdBy] 
/// * [shoppingListId] - List the item belongs to
/// * [name] 
/// * [quantity] - Free-text quantity, e.g. 2 lbs. Empty when not set.
/// * [note] - Empty when not set
/// * [isChecked] - Whether the item is crossed off
/// * [checkedAt] - When the item was crossed off; null while it is on the list
/// * [checkedByUserId] - Who crossed the item off; null while it is on the list
@BuiltValue()
abstract class ShoppingListItem implements Built<ShoppingListItem, ShoppingListItemBuilder> {
  @BuiltValueField(wireName: r'id')
  int get id;

  @BuiltValueField(wireName: r'createdAt')
  DateTime? get createdAt;

  @BuiltValueField(wireName: r'updatedAt')
  DateTime? get updatedAt;

  @BuiltValueField(wireName: r'createdBy')
  int? get createdBy;

  /// List the item belongs to
  @BuiltValueField(wireName: r'shoppingListId')
  int get shoppingListId;

  @BuiltValueField(wireName: r'name')
  String get name;

  /// Free-text quantity, e.g. 2 lbs. Empty when not set.
  @BuiltValueField(wireName: r'quantity')
  String get quantity;

  /// Empty when not set
  @BuiltValueField(wireName: r'note')
  String get note;

  /// Whether the item is crossed off
  @BuiltValueField(wireName: r'isChecked')
  bool get isChecked;

  /// When the item was crossed off; null while it is on the list
  @BuiltValueField(wireName: r'checkedAt')
  DateTime? get checkedAt;

  /// Who crossed the item off; null while it is on the list
  @BuiltValueField(wireName: r'checkedByUserId')
  int? get checkedByUserId;

  ShoppingListItem._();

  factory ShoppingListItem([void updates(ShoppingListItemBuilder b)]) = _$ShoppingListItem;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ShoppingListItemBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ShoppingListItem> get serializer => _$ShoppingListItemSerializer();
}

class _$ShoppingListItemSerializer implements PrimitiveSerializer<ShoppingListItem> {
  @override
  final Iterable<Type> types = const [ShoppingListItem, _$ShoppingListItem];

  @override
  final String wireName = r'ShoppingListItem';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ShoppingListItem object, {
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
    yield r'shoppingListId';
    yield serializers.serialize(
      object.shoppingListId,
      specifiedType: const FullType(int),
    );
    yield r'name';
    yield serializers.serialize(
      object.name,
      specifiedType: const FullType(String),
    );
    yield r'quantity';
    yield serializers.serialize(
      object.quantity,
      specifiedType: const FullType(String),
    );
    yield r'note';
    yield serializers.serialize(
      object.note,
      specifiedType: const FullType(String),
    );
    yield r'isChecked';
    yield serializers.serialize(
      object.isChecked,
      specifiedType: const FullType(bool),
    );
    if (object.checkedAt != null) {
      yield r'checkedAt';
      yield serializers.serialize(
        object.checkedAt,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.checkedByUserId != null) {
      yield r'checkedByUserId';
      yield serializers.serialize(
        object.checkedByUserId,
        specifiedType: const FullType(int),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    ShoppingListItem object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ShoppingListItemBuilder result,
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
        case r'shoppingListId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.shoppingListId = valueDes;
          break;
        case r'name':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.name = valueDes;
          break;
        case r'quantity':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.quantity = valueDes;
          break;
        case r'note':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.note = valueDes;
          break;
        case r'isChecked':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.isChecked = valueDes;
          break;
        case r'checkedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.checkedAt = valueDes;
          break;
        case r'checkedByUserId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.checkedByUserId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ShoppingListItem deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ShoppingListItemBuilder();
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

