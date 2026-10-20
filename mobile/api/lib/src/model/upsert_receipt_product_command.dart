//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'upsert_receipt_product_command.g.dart';

/// A person's own entry of a receipt product line
///
/// Properties:
/// * [name] 
/// * [amount] - What the line cost, as a decimal string with at most 2 decimals; null for no price
/// * [quantity] - Quantity or weight; may be empty
@BuiltValue()
abstract class UpsertReceiptProductCommand implements Built<UpsertReceiptProductCommand, UpsertReceiptProductCommandBuilder> {
  @BuiltValueField(wireName: r'name')
  String get name;

  /// What the line cost, as a decimal string with at most 2 decimals; null for no price
  @BuiltValueField(wireName: r'amount')
  String? get amount;

  /// Quantity or weight; may be empty
  @BuiltValueField(wireName: r'quantity')
  String? get quantity;

  UpsertReceiptProductCommand._();

  factory UpsertReceiptProductCommand([void updates(UpsertReceiptProductCommandBuilder b)]) = _$UpsertReceiptProductCommand;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(UpsertReceiptProductCommandBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<UpsertReceiptProductCommand> get serializer => _$UpsertReceiptProductCommandSerializer();
}

class _$UpsertReceiptProductCommandSerializer implements PrimitiveSerializer<UpsertReceiptProductCommand> {
  @override
  final Iterable<Type> types = const [UpsertReceiptProductCommand, _$UpsertReceiptProductCommand];

  @override
  final String wireName = r'UpsertReceiptProductCommand';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    UpsertReceiptProductCommand object, {
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
    if (object.quantity != null) {
      yield r'quantity';
      yield serializers.serialize(
        object.quantity,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    UpsertReceiptProductCommand object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required UpsertReceiptProductCommandBuilder result,
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
        case r'quantity':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.quantity = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  UpsertReceiptProductCommand deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = UpsertReceiptProductCommandBuilder();
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

