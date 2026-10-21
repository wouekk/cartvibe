//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'gemini_models_command.g.dart';

/// Which key to list models for. Send a new key, or the id of saved settings to use its stored key.
///
/// Properties:
/// * [key] - A Gemini API key not saved yet
/// * [receiptProcessingSettingsId] - Saved settings whose stored key is used when no key is sent
@BuiltValue()
abstract class GeminiModelsCommand implements Built<GeminiModelsCommand, GeminiModelsCommandBuilder> {
  /// A Gemini API key not saved yet
  @BuiltValueField(wireName: r'key')
  String? get key;

  /// Saved settings whose stored key is used when no key is sent
  @BuiltValueField(wireName: r'receiptProcessingSettingsId')
  int? get receiptProcessingSettingsId;

  GeminiModelsCommand._();

  factory GeminiModelsCommand([void updates(GeminiModelsCommandBuilder b)]) = _$GeminiModelsCommand;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(GeminiModelsCommandBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<GeminiModelsCommand> get serializer => _$GeminiModelsCommandSerializer();
}

class _$GeminiModelsCommandSerializer implements PrimitiveSerializer<GeminiModelsCommand> {
  @override
  final Iterable<Type> types = const [GeminiModelsCommand, _$GeminiModelsCommand];

  @override
  final String wireName = r'GeminiModelsCommand';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    GeminiModelsCommand object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.key != null) {
      yield r'key';
      yield serializers.serialize(
        object.key,
        specifiedType: const FullType(String),
      );
    }
    if (object.receiptProcessingSettingsId != null) {
      yield r'receiptProcessingSettingsId';
      yield serializers.serialize(
        object.receiptProcessingSettingsId,
        specifiedType: const FullType(int),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    GeminiModelsCommand object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required GeminiModelsCommandBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'key':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.key = valueDes;
          break;
        case r'receiptProcessingSettingsId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.receiptProcessingSettingsId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  GeminiModelsCommand deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = GeminiModelsCommandBuilder();
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

