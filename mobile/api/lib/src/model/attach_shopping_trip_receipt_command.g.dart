// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'attach_shopping_trip_receipt_command.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$AttachShoppingTripReceiptCommand
    extends AttachShoppingTripReceiptCommand {
  @override
  final int receiptId;

  factory _$AttachShoppingTripReceiptCommand(
          [void Function(AttachShoppingTripReceiptCommandBuilder)? updates]) =>
      (AttachShoppingTripReceiptCommandBuilder()..update(updates))._build();

  _$AttachShoppingTripReceiptCommand._({required this.receiptId}) : super._();
  @override
  AttachShoppingTripReceiptCommand rebuild(
          void Function(AttachShoppingTripReceiptCommandBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  AttachShoppingTripReceiptCommandBuilder toBuilder() =>
      AttachShoppingTripReceiptCommandBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is AttachShoppingTripReceiptCommand &&
        receiptId == other.receiptId;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, receiptId.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'AttachShoppingTripReceiptCommand')
          ..add('receiptId', receiptId))
        .toString();
  }
}

class AttachShoppingTripReceiptCommandBuilder
    implements
        Builder<AttachShoppingTripReceiptCommand,
            AttachShoppingTripReceiptCommandBuilder> {
  _$AttachShoppingTripReceiptCommand? _$v;

  int? _receiptId;
  int? get receiptId => _$this._receiptId;
  set receiptId(int? receiptId) => _$this._receiptId = receiptId;

  AttachShoppingTripReceiptCommandBuilder() {
    AttachShoppingTripReceiptCommand._defaults(this);
  }

  AttachShoppingTripReceiptCommandBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _receiptId = $v.receiptId;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(AttachShoppingTripReceiptCommand other) {
    _$v = other as _$AttachShoppingTripReceiptCommand;
  }

  @override
  void update(void Function(AttachShoppingTripReceiptCommandBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  AttachShoppingTripReceiptCommand build() => _build();

  _$AttachShoppingTripReceiptCommand _build() {
    final _$result = _$v ??
        _$AttachShoppingTripReceiptCommand._(
          receiptId: BuiltValueNullFieldError.checkNotNull(
              receiptId, r'AttachShoppingTripReceiptCommand', 'receiptId'),
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
