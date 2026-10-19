//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'set_shopping_list_item_checked_command.g.dart';

/// SetShoppingListItemCheckedCommand
///
/// Properties:
/// * [isChecked] - The target state. Setting the state an item is already in changes nothing.
@BuiltValue()
abstract class SetShoppingListItemCheckedCommand implements Built<SetShoppingListItemCheckedCommand, SetShoppingListItemCheckedCommandBuilder> {
  /// The target state. Setting the state an item is already in changes nothing.
  @BuiltValueField(wireName: r'isChecked')
  bool get isChecked;

  SetShoppingListItemCheckedCommand._();

  factory SetShoppingListItemCheckedCommand([void updates(SetShoppingListItemCheckedCommandBuilder b)]) = _$SetShoppingListItemCheckedCommand;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(SetShoppingListItemCheckedCommandBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<SetShoppingListItemCheckedCommand> get serializer => _$SetShoppingListItemCheckedCommandSerializer();
}

class _$SetShoppingListItemCheckedCommandSerializer implements PrimitiveSerializer<SetShoppingListItemCheckedCommand> {
  @override
  final Iterable<Type> types = const [SetShoppingListItemCheckedCommand, _$SetShoppingListItemCheckedCommand];

  @override
  final String wireName = r'SetShoppingListItemCheckedCommand';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    SetShoppingListItemCheckedCommand object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'isChecked';
    yield serializers.serialize(
      object.isChecked,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    SetShoppingListItemCheckedCommand object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required SetShoppingListItemCheckedCommandBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'isChecked':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.isChecked = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  SetShoppingListItemCheckedCommand deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = SetShoppingListItemCheckedCommandBuilder();
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

