// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'upsert_shopping_list_command.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$UpsertShoppingListCommand extends UpsertShoppingListCommand {
  @override
  final String name;

  factory _$UpsertShoppingListCommand(
          [void Function(UpsertShoppingListCommandBuilder)? updates]) =>
      (UpsertShoppingListCommandBuilder()..update(updates))._build();

  _$UpsertShoppingListCommand._({required this.name}) : super._();
  @override
  UpsertShoppingListCommand rebuild(
          void Function(UpsertShoppingListCommandBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  UpsertShoppingListCommandBuilder toBuilder() =>
      UpsertShoppingListCommandBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is UpsertShoppingListCommand && name == other.name;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, name.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'UpsertShoppingListCommand')
          ..add('name', name))
        .toString();
  }
}

class UpsertShoppingListCommandBuilder
    implements
        Builder<UpsertShoppingListCommand, UpsertShoppingListCommandBuilder> {
  _$UpsertShoppingListCommand? _$v;

  String? _name;
  String? get name => _$this._name;
  set name(String? name) => _$this._name = name;

  UpsertShoppingListCommandBuilder() {
    UpsertShoppingListCommand._defaults(this);
  }

  UpsertShoppingListCommandBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _name = $v.name;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(UpsertShoppingListCommand other) {
    _$v = other as _$UpsertShoppingListCommand;
  }

  @override
  void update(void Function(UpsertShoppingListCommandBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  UpsertShoppingListCommand build() => _build();

  _$UpsertShoppingListCommand _build() {
    final _$result = _$v ??
        _$UpsertShoppingListCommand._(
          name: BuiltValueNullFieldError.checkNotNull(
              name, r'UpsertShoppingListCommand', 'name'),
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
