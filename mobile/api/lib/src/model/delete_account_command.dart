//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'delete_account_command.g.dart';

/// Command to delete the user's own account
///
/// Properties:
/// * [password] - User's current password for confirmation
@BuiltValue()
abstract class DeleteAccountCommand implements Built<DeleteAccountCommand, DeleteAccountCommandBuilder> {
  /// User's current password for confirmation
  @BuiltValueField(wireName: r'password')
  String get password;

  DeleteAccountCommand._();

  factory DeleteAccountCommand([void updates(DeleteAccountCommandBuilder b)]) = _$DeleteAccountCommand;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(DeleteAccountCommandBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<DeleteAccountCommand> get serializer => _$DeleteAccountCommandSerializer();
}

class _$DeleteAccountCommandSerializer implements PrimitiveSerializer<DeleteAccountCommand> {
  @override
  final Iterable<Type> types = const [DeleteAccountCommand, _$DeleteAccountCommand];

  @override
  final String wireName = r'DeleteAccountCommand';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    DeleteAccountCommand object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'password';
    yield serializers.serialize(
      object.password,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    DeleteAccountCommand object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required DeleteAccountCommandBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'password':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.password = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  DeleteAccountCommand deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = DeleteAccountCommandBuilder();
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

