// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'queued_receipts_view.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$QueuedReceiptsView extends QueuedReceiptsView {
  @override
  final int queued;

  factory _$QueuedReceiptsView(
          [void Function(QueuedReceiptsViewBuilder)? updates]) =>
      (QueuedReceiptsViewBuilder()..update(updates))._build();

  _$QueuedReceiptsView._({required this.queued}) : super._();
  @override
  QueuedReceiptsView rebuild(
          void Function(QueuedReceiptsViewBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  QueuedReceiptsViewBuilder toBuilder() =>
      QueuedReceiptsViewBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is QueuedReceiptsView && queued == other.queued;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, queued.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'QueuedReceiptsView')
          ..add('queued', queued))
        .toString();
  }
}

class QueuedReceiptsViewBuilder
    implements Builder<QueuedReceiptsView, QueuedReceiptsViewBuilder> {
  _$QueuedReceiptsView? _$v;

  int? _queued;
  int? get queued => _$this._queued;
  set queued(int? queued) => _$this._queued = queued;

  QueuedReceiptsViewBuilder() {
    QueuedReceiptsView._defaults(this);
  }

  QueuedReceiptsViewBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _queued = $v.queued;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(QueuedReceiptsView other) {
    _$v = other as _$QueuedReceiptsView;
  }

  @override
  void update(void Function(QueuedReceiptsViewBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  QueuedReceiptsView build() => _build();

  _$QueuedReceiptsView _build() {
    final _$result = _$v ??
        _$QueuedReceiptsView._(
          queued: BuiltValueNullFieldError.checkNotNull(
              queued, r'QueuedReceiptsView', 'queued'),
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
