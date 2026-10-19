//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'upsert_shopping_list_command.g.dart';

/// UpsertShoppingListCommand
///
/// Properties:
/// * [name] 
@BuiltValue()
abstract class UpsertShoppingListCommand implements Built<UpsertShoppingListCommand, UpsertShoppingListCommandBuilder> {
  @BuiltValueField(wireName: r'name')
  String get name;

  UpsertShoppingListCommand._();

  factory UpsertShoppingListCommand([void updates(UpsertShoppingListCommandBuilder b)]) = _$UpsertShoppingListCommand;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(UpsertShoppingListCommandBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<UpsertShoppingListCommand> get serializer => _$UpsertShoppingListCommandSerializer();
}

class _$UpsertShoppingListCommandSerializer implements PrimitiveSerializer<UpsertShoppingListCommand> {
  @override
  final Iterable<Type> types = const [UpsertShoppingListCommand, _$UpsertShoppingListCommand];

  @override
  final String wireName = r'UpsertShoppingListCommand';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    UpsertShoppingListCommand object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'name';
    yield serializers.serialize(
      object.name,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    UpsertShoppingListCommand object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required UpsertShoppingListCommandBuilder result,
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
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  UpsertShoppingListCommand deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = UpsertShoppingListCommandBuilder();
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

