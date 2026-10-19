//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'upsert_shopping_list_item_command.g.dart';

/// UpsertShoppingListItemCommand
///
/// Properties:
/// * [name] 
/// * [amount] - How much to buy, as a decimal string; greater than 0, below 100000, at most 3 decimals
/// * [unit] - One of the ShoppingListItem units; requires an amount
/// * [quantity] 
/// * [note] 
@BuiltValue()
abstract class UpsertShoppingListItemCommand implements Built<UpsertShoppingListItemCommand, UpsertShoppingListItemCommandBuilder> {
  @BuiltValueField(wireName: r'name')
  String get name;

  /// How much to buy, as a decimal string; greater than 0, below 100000, at most 3 decimals
  @BuiltValueField(wireName: r'amount')
  String? get amount;

  /// One of the ShoppingListItem units; requires an amount
  @BuiltValueField(wireName: r'unit')
  String? get unit;

  @BuiltValueField(wireName: r'quantity')
  String? get quantity;

  @BuiltValueField(wireName: r'note')
  String? get note;

  UpsertShoppingListItemCommand._();

  factory UpsertShoppingListItemCommand([void updates(UpsertShoppingListItemCommandBuilder b)]) = _$UpsertShoppingListItemCommand;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(UpsertShoppingListItemCommandBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<UpsertShoppingListItemCommand> get serializer => _$UpsertShoppingListItemCommandSerializer();
}

class _$UpsertShoppingListItemCommandSerializer implements PrimitiveSerializer<UpsertShoppingListItemCommand> {
  @override
  final Iterable<Type> types = const [UpsertShoppingListItemCommand, _$UpsertShoppingListItemCommand];

  @override
  final String wireName = r'UpsertShoppingListItemCommand';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    UpsertShoppingListItemCommand object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
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
    if (object.unit != null) {
      yield r'unit';
      yield serializers.serialize(
        object.unit,
        specifiedType: const FullType(String),
      );
    }
    if (object.quantity != null) {
      yield r'quantity';
      yield serializers.serialize(
        object.quantity,
        specifiedType: const FullType(String),
      );
    }
    if (object.note != null) {
      yield r'note';
      yield serializers.serialize(
        object.note,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    UpsertShoppingListItemCommand object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required UpsertShoppingListItemCommandBuilder result,
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
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  UpsertShoppingListItemCommand deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = UpsertShoppingListItemCommandBuilder();
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

