//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'attach_shopping_trip_receipt_command.g.dart';

/// AttachShoppingTripReceiptCommand
///
/// Properties:
/// * [receiptId] 
@BuiltValue()
abstract class AttachShoppingTripReceiptCommand implements Built<AttachShoppingTripReceiptCommand, AttachShoppingTripReceiptCommandBuilder> {
  @BuiltValueField(wireName: r'receiptId')
  int get receiptId;

  AttachShoppingTripReceiptCommand._();

  factory AttachShoppingTripReceiptCommand([void updates(AttachShoppingTripReceiptCommandBuilder b)]) = _$AttachShoppingTripReceiptCommand;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AttachShoppingTripReceiptCommandBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AttachShoppingTripReceiptCommand> get serializer => _$AttachShoppingTripReceiptCommandSerializer();
}

class _$AttachShoppingTripReceiptCommandSerializer implements PrimitiveSerializer<AttachShoppingTripReceiptCommand> {
  @override
  final Iterable<Type> types = const [AttachShoppingTripReceiptCommand, _$AttachShoppingTripReceiptCommand];

  @override
  final String wireName = r'AttachShoppingTripReceiptCommand';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AttachShoppingTripReceiptCommand object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'receiptId';
    yield serializers.serialize(
      object.receiptId,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AttachShoppingTripReceiptCommand object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AttachShoppingTripReceiptCommandBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'receiptId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.receiptId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AttachShoppingTripReceiptCommand deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AttachShoppingTripReceiptCommandBuilder();
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

