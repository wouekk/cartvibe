//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'gemini_model.g.dart';

/// GeminiModel
///
/// Properties:
/// * [name] - The model id to store, for example gemini-2.5-flash
/// * [displayName] 
@BuiltValue()
abstract class GeminiModel implements Built<GeminiModel, GeminiModelBuilder> {
  /// The model id to store, for example gemini-2.5-flash
  @BuiltValueField(wireName: r'name')
  String get name;

  @BuiltValueField(wireName: r'displayName')
  String get displayName;

  GeminiModel._();

  factory GeminiModel([void updates(GeminiModelBuilder b)]) = _$GeminiModel;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(GeminiModelBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<GeminiModel> get serializer => _$GeminiModelSerializer();
}

class _$GeminiModelSerializer implements PrimitiveSerializer<GeminiModel> {
  @override
  final Iterable<Type> types = const [GeminiModel, _$GeminiModel];

  @override
  final String wireName = r'GeminiModel';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    GeminiModel object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'name';
    yield serializers.serialize(
      object.name,
      specifiedType: const FullType(String),
    );
    yield r'displayName';
    yield serializers.serialize(
      object.displayName,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    GeminiModel object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required GeminiModelBuilder result,
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
        case r'displayName':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.displayName = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  GeminiModel deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = GeminiModelBuilder();
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

