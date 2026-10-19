// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'set_shopping_list_item_checked_command.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$SetShoppingListItemCheckedCommand
    extends SetShoppingListItemCheckedCommand {
  @override
  final bool isChecked;

  factory _$SetShoppingListItemCheckedCommand(
          [void Function(SetShoppingListItemCheckedCommandBuilder)? updates]) =>
      (SetShoppingListItemCheckedCommandBuilder()..update(updates))._build();

  _$SetShoppingListItemCheckedCommand._({required this.isChecked}) : super._();
  @override
  SetShoppingListItemCheckedCommand rebuild(
          void Function(SetShoppingListItemCheckedCommandBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  SetShoppingListItemCheckedCommandBuilder toBuilder() =>
      SetShoppingListItemCheckedCommandBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is SetShoppingListItemCheckedCommand &&
        isChecked == other.isChecked;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, isChecked.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'SetShoppingListItemCheckedCommand')
          ..add('isChecked', isChecked))
        .toString();
  }
}

class SetShoppingListItemCheckedCommandBuilder
    implements
        Builder<SetShoppingListItemCheckedCommand,
            SetShoppingListItemCheckedCommandBuilder> {
  _$SetShoppingListItemCheckedCommand? _$v;

  bool? _isChecked;
  bool? get isChecked => _$this._isChecked;
  set isChecked(bool? isChecked) => _$this._isChecked = isChecked;

  SetShoppingListItemCheckedCommandBuilder() {
    SetShoppingListItemCheckedCommand._defaults(this);
  }

  SetShoppingListItemCheckedCommandBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _isChecked = $v.isChecked;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(SetShoppingListItemCheckedCommand other) {
    _$v = other as _$SetShoppingListItemCheckedCommand;
  }

  @override
  void update(
      void Function(SetShoppingListItemCheckedCommandBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  SetShoppingListItemCheckedCommand build() => _build();

  _$SetShoppingListItemCheckedCommand _build() {
    final _$result = _$v ??
        _$SetShoppingListItemCheckedCommand._(
          isChecked: BuiltValueNullFieldError.checkNotNull(
              isChecked, r'SetShoppingListItemCheckedCommand', 'isChecked'),
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
