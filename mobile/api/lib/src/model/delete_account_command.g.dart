// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'delete_account_command.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$DeleteAccountCommand extends DeleteAccountCommand {
  @override
  final String password;

  factory _$DeleteAccountCommand(
          [void Function(DeleteAccountCommandBuilder)? updates]) =>
      (DeleteAccountCommandBuilder()..update(updates))._build();

  _$DeleteAccountCommand._({required this.password}) : super._();
  @override
  DeleteAccountCommand rebuild(
          void Function(DeleteAccountCommandBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  DeleteAccountCommandBuilder toBuilder() =>
      DeleteAccountCommandBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is DeleteAccountCommand && password == other.password;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, password.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'DeleteAccountCommand')
          ..add('password', password))
        .toString();
  }
}

class DeleteAccountCommandBuilder
    implements Builder<DeleteAccountCommand, DeleteAccountCommandBuilder> {
  _$DeleteAccountCommand? _$v;

  String? _password;
  String? get password => _$this._password;
  set password(String? password) => _$this._password = password;

  DeleteAccountCommandBuilder() {
    DeleteAccountCommand._defaults(this);
  }

  DeleteAccountCommandBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _password = $v.password;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(DeleteAccountCommand other) {
    _$v = other as _$DeleteAccountCommand;
  }

  @override
  void update(void Function(DeleteAccountCommandBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  DeleteAccountCommand build() => _build();

  _$DeleteAccountCommand _build() {
    final _$result = _$v ??
        _$DeleteAccountCommand._(
          password: BuiltValueNullFieldError.checkNotNull(
              password, r'DeleteAccountCommand', 'password'),
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
