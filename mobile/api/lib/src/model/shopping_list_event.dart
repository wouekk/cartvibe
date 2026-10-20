//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:openapi/src/model/shopping_list.dart';
import 'package:built_collection/built_collection.dart';
import 'package:openapi/src/model/shopping_list_item.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'shopping_list_event.g.dart';

/// One shopping list mutation, as sent on the group's event stream. It carries the full changed entity, so applying it is an idempotent upsert or remove by id.
///
/// Properties:
/// * [type] - One of LIST_CREATED, LIST_UPDATED, LIST_DELETED, ITEM_ADDED, ITEM_UPDATED, ITEM_TOGGLED, ITEM_DELETED, CHECKED_CLEARED, TRIPS_CHANGED. TRIPS_CHANGED carries no entity: refetch the list's trips, which need receipt access the stream does not check. Deliberately a plain string rather than an enum, so a client built before a new event type ships can ignore it instead of failing to deserialize.
/// * [groupId] 
/// * [shoppingListId] 
/// * [list] 
/// * [item] 
/// * [itemIds] - Ids of the items removed by CHECKED_CLEARED
@BuiltValue()
abstract class ShoppingListEvent implements Built<ShoppingListEvent, ShoppingListEventBuilder> {
  /// One of LIST_CREATED, LIST_UPDATED, LIST_DELETED, ITEM_ADDED, ITEM_UPDATED, ITEM_TOGGLED, ITEM_DELETED, CHECKED_CLEARED, TRIPS_CHANGED. TRIPS_CHANGED carries no entity: refetch the list's trips, which need receipt access the stream does not check. Deliberately a plain string rather than an enum, so a client built before a new event type ships can ignore it instead of failing to deserialize.
  @BuiltValueField(wireName: r'type')
  String get type;

  @BuiltValueField(wireName: r'groupId')
  int get groupId;

  @BuiltValueField(wireName: r'shoppingListId')
  int get shoppingListId;

  @BuiltValueField(wireName: r'list')
  ShoppingList? get list;

  @BuiltValueField(wireName: r'item')
  ShoppingListItem? get item;

  /// Ids of the items removed by CHECKED_CLEARED
  @BuiltValueField(wireName: r'itemIds')
  BuiltList<int>? get itemIds;

  ShoppingListEvent._();

  factory ShoppingListEvent([void updates(ShoppingListEventBuilder b)]) = _$ShoppingListEvent;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ShoppingListEventBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ShoppingListEvent> get serializer => _$ShoppingListEventSerializer();
}

class _$ShoppingListEventSerializer implements PrimitiveSerializer<ShoppingListEvent> {
  @override
  final Iterable<Type> types = const [ShoppingListEvent, _$ShoppingListEvent];

  @override
  final String wireName = r'ShoppingListEvent';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ShoppingListEvent object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'type';
    yield serializers.serialize(
      object.type,
      specifiedType: const FullType(String),
    );
    yield r'groupId';
    yield serializers.serialize(
      object.groupId,
      specifiedType: const FullType(int),
    );
    yield r'shoppingListId';
    yield serializers.serialize(
      object.shoppingListId,
      specifiedType: const FullType(int),
    );
    if (object.list != null) {
      yield r'list';
      yield serializers.serialize(
        object.list,
        specifiedType: const FullType(ShoppingList),
      );
    }
    if (object.item != null) {
      yield r'item';
      yield serializers.serialize(
        object.item,
        specifiedType: const FullType(ShoppingListItem),
      );
    }
    if (object.itemIds != null) {
      yield r'itemIds';
      yield serializers.serialize(
        object.itemIds,
        specifiedType: const FullType(BuiltList, [FullType(int)]),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    ShoppingListEvent object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ShoppingListEventBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'type':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.type = valueDes;
          break;
        case r'groupId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.groupId = valueDes;
          break;
        case r'shoppingListId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.shoppingListId = valueDes;
          break;
        case r'list':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ShoppingList),
          ) as ShoppingList;
          result.list.replace(valueDes);
          break;
        case r'item':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ShoppingListItem),
          ) as ShoppingListItem;
          result.item.replace(valueDes);
          break;
        case r'itemIds':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(int)]),
          ) as BuiltList<int>;
          result.itemIds.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ShoppingListEvent deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ShoppingListEventBuilder();
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

