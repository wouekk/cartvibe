//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'queued_receipts_view.g.dart';

/// QueuedReceiptsView
///
/// Properties:
/// * [queued] - How many receipts were queued
@BuiltValue()
abstract class QueuedReceiptsView implements Built<QueuedReceiptsView, QueuedReceiptsViewBuilder> {
  /// How many receipts were queued
  @BuiltValueField(wireName: r'queued')
  int get queued;

  QueuedReceiptsView._();

  factory QueuedReceiptsView([void updates(QueuedReceiptsViewBuilder b)]) = _$QueuedReceiptsView;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(QueuedReceiptsViewBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<QueuedReceiptsView> get serializer => _$QueuedReceiptsViewSerializer();
}

class _$QueuedReceiptsViewSerializer implements PrimitiveSerializer<QueuedReceiptsView> {
  @override
  final Iterable<Type> types = const [QueuedReceiptsView, _$QueuedReceiptsView];

  @override
  final String wireName = r'QueuedReceiptsView';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    QueuedReceiptsView object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'queued';
    yield serializers.serialize(
      object.queued,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    QueuedReceiptsView object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required QueuedReceiptsViewBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'queued':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.queued = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  QueuedReceiptsView deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = QueuedReceiptsViewBuilder();
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

