//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'app_log_entry.g.dart';

/// One entry of the application log. The level is a plain string on purpose.
///
/// Properties:
/// * [timestamp] - Local server time, yyyy/MM/dd HH:mm:ss
/// * [level] 
/// * [message] 
@BuiltValue()
abstract class AppLogEntry implements Built<AppLogEntry, AppLogEntryBuilder> {
  /// Local server time, yyyy/MM/dd HH:mm:ss
  @BuiltValueField(wireName: r'timestamp')
  String get timestamp;

  @BuiltValueField(wireName: r'level')
  String get level;

  @BuiltValueField(wireName: r'message')
  String get message;

  AppLogEntry._();

  factory AppLogEntry([void updates(AppLogEntryBuilder b)]) = _$AppLogEntry;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AppLogEntryBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AppLogEntry> get serializer => _$AppLogEntrySerializer();
}

class _$AppLogEntrySerializer implements PrimitiveSerializer<AppLogEntry> {
  @override
  final Iterable<Type> types = const [AppLogEntry, _$AppLogEntry];

  @override
  final String wireName = r'AppLogEntry';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AppLogEntry object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'timestamp';
    yield serializers.serialize(
      object.timestamp,
      specifiedType: const FullType(String),
    );
    yield r'level';
    yield serializers.serialize(
      object.level,
      specifiedType: const FullType(String),
    );
    yield r'message';
    yield serializers.serialize(
      object.message,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AppLogEntry object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AppLogEntryBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'timestamp':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.timestamp = valueDes;
          break;
        case r'level':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.level = valueDes;
          break;
        case r'message':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.message = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AppLogEntry deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AppLogEntryBuilder();
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

