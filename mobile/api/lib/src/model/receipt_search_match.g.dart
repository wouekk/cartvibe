// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'receipt_search_match.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$ReceiptSearchMatch extends ReceiptSearchMatch {
  @override
  final String name;
  @override
  final String? amount;

  factory _$ReceiptSearchMatch(
          [void Function(ReceiptSearchMatchBuilder)? updates]) =>
      (ReceiptSearchMatchBuilder()..update(updates))._build();

  _$ReceiptSearchMatch._({required this.name, this.amount}) : super._();
  @override
  ReceiptSearchMatch rebuild(
          void Function(ReceiptSearchMatchBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  ReceiptSearchMatchBuilder toBuilder() =>
      ReceiptSearchMatchBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is ReceiptSearchMatch &&
        name == other.name &&
        amount == other.amount;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, name.hashCode);
    _$hash = $jc(_$hash, amount.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'ReceiptSearchMatch')
          ..add('name', name)
          ..add('amount', amount))
        .toString();
  }
}

class ReceiptSearchMatchBuilder
    implements Builder<ReceiptSearchMatch, ReceiptSearchMatchBuilder> {
  _$ReceiptSearchMatch? _$v;

  String? _name;
  String? get name => _$this._name;
  set name(String? name) => _$this._name = name;

  String? _amount;
  String? get amount => _$this._amount;
  set amount(String? amount) => _$this._amount = amount;

  ReceiptSearchMatchBuilder() {
    ReceiptSearchMatch._defaults(this);
  }

  ReceiptSearchMatchBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _name = $v.name;
      _amount = $v.amount;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(ReceiptSearchMatch other) {
    _$v = other as _$ReceiptSearchMatch;
  }

  @override
  void update(void Function(ReceiptSearchMatchBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  ReceiptSearchMatch build() => _build();

  _$ReceiptSearchMatch _build() {
    final _$result = _$v ??
        _$ReceiptSearchMatch._(
          name: BuiltValueNullFieldError.checkNotNull(
              name, r'ReceiptSearchMatch', 'name'),
          amount: amount,
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
