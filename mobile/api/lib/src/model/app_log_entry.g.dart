// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_log_entry.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$AppLogEntry extends AppLogEntry {
  @override
  final String timestamp;
  @override
  final String level;
  @override
  final String message;

  factory _$AppLogEntry([void Function(AppLogEntryBuilder)? updates]) =>
      (AppLogEntryBuilder()..update(updates))._build();

  _$AppLogEntry._(
      {required this.timestamp, required this.level, required this.message})
      : super._();
  @override
  AppLogEntry rebuild(void Function(AppLogEntryBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  AppLogEntryBuilder toBuilder() => AppLogEntryBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is AppLogEntry &&
        timestamp == other.timestamp &&
        level == other.level &&
        message == other.message;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, timestamp.hashCode);
    _$hash = $jc(_$hash, level.hashCode);
    _$hash = $jc(_$hash, message.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'AppLogEntry')
          ..add('timestamp', timestamp)
          ..add('level', level)
          ..add('message', message))
        .toString();
  }
}

class AppLogEntryBuilder implements Builder<AppLogEntry, AppLogEntryBuilder> {
  _$AppLogEntry? _$v;

  String? _timestamp;
  String? get timestamp => _$this._timestamp;
  set timestamp(String? timestamp) => _$this._timestamp = timestamp;

  String? _level;
  String? get level => _$this._level;
  set level(String? level) => _$this._level = level;

  String? _message;
  String? get message => _$this._message;
  set message(String? message) => _$this._message = message;

  AppLogEntryBuilder() {
    AppLogEntry._defaults(this);
  }

  AppLogEntryBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _timestamp = $v.timestamp;
      _level = $v.level;
      _message = $v.message;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(AppLogEntry other) {
    _$v = other as _$AppLogEntry;
  }

  @override
  void update(void Function(AppLogEntryBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  AppLogEntry build() => _build();

  _$AppLogEntry _build() {
    final _$result = _$v ??
        _$AppLogEntry._(
          timestamp: BuiltValueNullFieldError.checkNotNull(
              timestamp, r'AppLogEntry', 'timestamp'),
          level: BuiltValueNullFieldError.checkNotNull(
              level, r'AppLogEntry', 'level'),
          message: BuiltValueNullFieldError.checkNotNull(
              message, r'AppLogEntry', 'message'),
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
