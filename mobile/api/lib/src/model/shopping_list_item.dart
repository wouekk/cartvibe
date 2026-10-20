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
/// * [amount] - How much to buy, as a decimal string (e.g. \"1.5\"); null when not given
/// * [unit] - Unit of the amount: one of pcs, kg, g, l, ml, pack, bottle, can, box, bag, jar, bunch, dozen; empty when there is no amount or it is a plain count. A plain string, never an enum, so a unit added later cannot break an older client.
/// * [quantity] - The original free-text quantity, kept for items written before amount and unit existed. Superseded by amount and unit; empty when not set.
/// * [note] - Empty when not set
/// * [isChecked] - Whether the item is crossed off
/// * [checkedAt] - When the item was crossed off; null while it is on the list
/// * [checkedByUserId] - Who crossed the item off; null while it is on the list
/// * [health] - HEALTHY, MEDIUM, UNHEALTHY, NOT_FOOD, UNKNOWN, or empty while not yet classified. A plain string, never an enum, so a new rating cannot break an older client.
/// * [foodGroup] - A short lowercase food group, e.g. \"fresh produce\"; empty while not yet classified
/// * [seasonality] - For fresh fruit and vegetables, SEASONAL or OUT_OF_SEASON in Western Europe in the month bought; NOT_PRODUCE otherwise; empty while not yet classified. A plain string.
/// * [classifiedAt] - When the tags were set; null while waiting to be classified
/// * [classificationOverridden] - The tags were corrected by a person
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

  /// How much to buy, as a decimal string (e.g. \"1.5\"); null when not given
  @BuiltValueField(wireName: r'amount')
  String? get amount;

  /// Unit of the amount: one of pcs, kg, g, l, ml, pack, bottle, can, box, bag, jar, bunch, dozen; empty when there is no amount or it is a plain count. A plain string, never an enum, so a unit added later cannot break an older client.
  @BuiltValueField(wireName: r'unit')
  String get unit;

  /// The original free-text quantity, kept for items written before amount and unit existed. Superseded by amount and unit; empty when not set.
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

  /// HEALTHY, MEDIUM, UNHEALTHY, NOT_FOOD, UNKNOWN, or empty while not yet classified. A plain string, never an enum, so a new rating cannot break an older client.
  @BuiltValueField(wireName: r'health')
  String get health;

  /// A short lowercase food group, e.g. \"fresh produce\"; empty while not yet classified
  @BuiltValueField(wireName: r'foodGroup')
  String get foodGroup;

  /// For fresh fruit and vegetables, SEASONAL or OUT_OF_SEASON in Western Europe in the month bought; NOT_PRODUCE otherwise; empty while not yet classified. A plain string.
  @BuiltValueField(wireName: r'seasonality')
  String get seasonality;

  /// When the tags were set; null while waiting to be classified
  @BuiltValueField(wireName: r'classifiedAt')
  DateTime? get classifiedAt;

  /// The tags were corrected by a person
  @BuiltValueField(wireName: r'classificationOverridden')
  bool get classificationOverridden;

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
    if (object.amount != null) {
      yield r'amount';
      yield serializers.serialize(
        object.amount,
        specifiedType: const FullType(String),
      );
    }
    yield r'unit';
    yield serializers.serialize(
      object.unit,
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
    yield r'health';
    yield serializers.serialize(
      object.health,
      specifiedType: const FullType(String),
    );
    yield r'foodGroup';
    yield serializers.serialize(
      object.foodGroup,
      specifiedType: const FullType(String),
    );
    yield r'seasonality';
    yield serializers.serialize(
      object.seasonality,
      specifiedType: const FullType(String),
    );
    if (object.classifiedAt != null) {
      yield r'classifiedAt';
      yield serializers.serialize(
        object.classifiedAt,
        specifiedType: const FullType(DateTime),
      );
    }
    yield r'classificationOverridden';
    yield serializers.serialize(
      object.classificationOverridden,
      specifiedType: const FullType(bool),
    );
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
        case r'amount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.amount = valueDes;
          break;
        case r'unit':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.unit = valueDes;
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
        case r'health':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.health = valueDes;
          break;
        case r'foodGroup':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.foodGroup = valueDes;
          break;
        case r'seasonality':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.seasonality = valueDes;
          break;
        case r'classifiedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.classifiedAt = valueDes;
          break;
        case r'classificationOverridden':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.classificationOverridden = valueDes;
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

