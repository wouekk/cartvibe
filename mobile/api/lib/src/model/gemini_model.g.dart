// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'gemini_model.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$GeminiModel extends GeminiModel {
  @override
  final String name;
  @override
  final String displayName;

  factory _$GeminiModel([void Function(GeminiModelBuilder)? updates]) =>
      (GeminiModelBuilder()..update(updates))._build();

  _$GeminiModel._({required this.name, required this.displayName}) : super._();
  @override
  GeminiModel rebuild(void Function(GeminiModelBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  GeminiModelBuilder toBuilder() => GeminiModelBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is GeminiModel &&
        name == other.name &&
        displayName == other.displayName;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, name.hashCode);
    _$hash = $jc(_$hash, displayName.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'GeminiModel')
          ..add('name', name)
          ..add('displayName', displayName))
        .toString();
  }
}

class GeminiModelBuilder implements Builder<GeminiModel, GeminiModelBuilder> {
  _$GeminiModel? _$v;

  String? _name;
  String? get name => _$this._name;
  set name(String? name) => _$this._name = name;

  String? _displayName;
  String? get displayName => _$this._displayName;
  set displayName(String? displayName) => _$this._displayName = displayName;

  GeminiModelBuilder() {
    GeminiModel._defaults(this);
  }

  GeminiModelBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _name = $v.name;
      _displayName = $v.displayName;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(GeminiModel other) {
    _$v = other as _$GeminiModel;
  }

  @override
  void update(void Function(GeminiModelBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  GeminiModel build() => _build();

  _$GeminiModel _build() {
    final _$result = _$v ??
        _$GeminiModel._(
          name: BuiltValueNullFieldError.checkNotNull(
              name, r'GeminiModel', 'name'),
          displayName: BuiltValueNullFieldError.checkNotNull(
              displayName, r'GeminiModel', 'displayName'),
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
