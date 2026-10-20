// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_overview_product.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$GroupOverviewProduct extends GroupOverviewProduct {
  @override
  final int id;
  @override
  final int receiptId;
  @override
  final String receiptName;
  @override
  final String receiptDate;
  @override
  final String name;
  @override
  final String? amount;
  @override
  final String quantity;
  @override
  final String health;
  @override
  final bool? planned;

  factory _$GroupOverviewProduct(
          [void Function(GroupOverviewProductBuilder)? updates]) =>
      (GroupOverviewProductBuilder()..update(updates))._build();

  _$GroupOverviewProduct._(
      {required this.id,
      required this.receiptId,
      required this.receiptName,
      required this.receiptDate,
      required this.name,
      this.amount,
      required this.quantity,
      required this.health,
      this.planned})
      : super._();
  @override
  GroupOverviewProduct rebuild(
          void Function(GroupOverviewProductBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  GroupOverviewProductBuilder toBuilder() =>
      GroupOverviewProductBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is GroupOverviewProduct &&
        id == other.id &&
        receiptId == other.receiptId &&
        receiptName == other.receiptName &&
        receiptDate == other.receiptDate &&
        name == other.name &&
        amount == other.amount &&
        quantity == other.quantity &&
        health == other.health &&
        planned == other.planned;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, id.hashCode);
    _$hash = $jc(_$hash, receiptId.hashCode);
    _$hash = $jc(_$hash, receiptName.hashCode);
    _$hash = $jc(_$hash, receiptDate.hashCode);
    _$hash = $jc(_$hash, name.hashCode);
    _$hash = $jc(_$hash, amount.hashCode);
    _$hash = $jc(_$hash, quantity.hashCode);
    _$hash = $jc(_$hash, health.hashCode);
    _$hash = $jc(_$hash, planned.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'GroupOverviewProduct')
          ..add('id', id)
          ..add('receiptId', receiptId)
          ..add('receiptName', receiptName)
          ..add('receiptDate', receiptDate)
          ..add('name', name)
          ..add('amount', amount)
          ..add('quantity', quantity)
          ..add('health', health)
          ..add('planned', planned))
        .toString();
  }
}

class GroupOverviewProductBuilder
    implements Builder<GroupOverviewProduct, GroupOverviewProductBuilder> {
  _$GroupOverviewProduct? _$v;

  int? _id;
  int? get id => _$this._id;
  set id(int? id) => _$this._id = id;

  int? _receiptId;
  int? get receiptId => _$this._receiptId;
  set receiptId(int? receiptId) => _$this._receiptId = receiptId;

  String? _receiptName;
  String? get receiptName => _$this._receiptName;
  set receiptName(String? receiptName) => _$this._receiptName = receiptName;

  String? _receiptDate;
  String? get receiptDate => _$this._receiptDate;
  set receiptDate(String? receiptDate) => _$this._receiptDate = receiptDate;

  String? _name;
  String? get name => _$this._name;
  set name(String? name) => _$this._name = name;

  String? _amount;
  String? get amount => _$this._amount;
  set amount(String? amount) => _$this._amount = amount;

  String? _quantity;
  String? get quantity => _$this._quantity;
  set quantity(String? quantity) => _$this._quantity = quantity;

  String? _health;
  String? get health => _$this._health;
  set health(String? health) => _$this._health = health;

  bool? _planned;
  bool? get planned => _$this._planned;
  set planned(bool? planned) => _$this._planned = planned;

  GroupOverviewProductBuilder() {
    GroupOverviewProduct._defaults(this);
  }

  GroupOverviewProductBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _id = $v.id;
      _receiptId = $v.receiptId;
      _receiptName = $v.receiptName;
      _receiptDate = $v.receiptDate;
      _name = $v.name;
      _amount = $v.amount;
      _quantity = $v.quantity;
      _health = $v.health;
      _planned = $v.planned;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(GroupOverviewProduct other) {
    _$v = other as _$GroupOverviewProduct;
  }

  @override
  void update(void Function(GroupOverviewProductBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  GroupOverviewProduct build() => _build();

  _$GroupOverviewProduct _build() {
    final _$result = _$v ??
        _$GroupOverviewProduct._(
          id: BuiltValueNullFieldError.checkNotNull(
              id, r'GroupOverviewProduct', 'id'),
          receiptId: BuiltValueNullFieldError.checkNotNull(
              receiptId, r'GroupOverviewProduct', 'receiptId'),
          receiptName: BuiltValueNullFieldError.checkNotNull(
              receiptName, r'GroupOverviewProduct', 'receiptName'),
          receiptDate: BuiltValueNullFieldError.checkNotNull(
              receiptDate, r'GroupOverviewProduct', 'receiptDate'),
          name: BuiltValueNullFieldError.checkNotNull(
              name, r'GroupOverviewProduct', 'name'),
          amount: amount,
          quantity: BuiltValueNullFieldError.checkNotNull(
              quantity, r'GroupOverviewProduct', 'quantity'),
          health: BuiltValueNullFieldError.checkNotNull(
              health, r'GroupOverviewProduct', 'health'),
          planned: planned,
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
