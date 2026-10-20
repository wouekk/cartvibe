// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_overview.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$GroupOverview extends GroupOverview {
  @override
  final String month;
  @override
  final String total;
  @override
  final String previousTotal;
  @override
  final int receiptCount;
  @override
  final int openReceiptCount;
  @override
  final String unhealthyTotal;
  @override
  final BuiltList<GroupOverviewCategory> categories;
  @override
  final BuiltList<GroupOverviewMonth> months;

  factory _$GroupOverview([void Function(GroupOverviewBuilder)? updates]) =>
      (GroupOverviewBuilder()..update(updates))._build();

  _$GroupOverview._(
      {required this.month,
      required this.total,
      required this.previousTotal,
      required this.receiptCount,
      required this.openReceiptCount,
      required this.unhealthyTotal,
      required this.categories,
      required this.months})
      : super._();
  @override
  GroupOverview rebuild(void Function(GroupOverviewBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  GroupOverviewBuilder toBuilder() => GroupOverviewBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is GroupOverview &&
        month == other.month &&
        total == other.total &&
        previousTotal == other.previousTotal &&
        receiptCount == other.receiptCount &&
        openReceiptCount == other.openReceiptCount &&
        unhealthyTotal == other.unhealthyTotal &&
        categories == other.categories &&
        months == other.months;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, month.hashCode);
    _$hash = $jc(_$hash, total.hashCode);
    _$hash = $jc(_$hash, previousTotal.hashCode);
    _$hash = $jc(_$hash, receiptCount.hashCode);
    _$hash = $jc(_$hash, openReceiptCount.hashCode);
    _$hash = $jc(_$hash, unhealthyTotal.hashCode);
    _$hash = $jc(_$hash, categories.hashCode);
    _$hash = $jc(_$hash, months.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'GroupOverview')
          ..add('month', month)
          ..add('total', total)
          ..add('previousTotal', previousTotal)
          ..add('receiptCount', receiptCount)
          ..add('openReceiptCount', openReceiptCount)
          ..add('unhealthyTotal', unhealthyTotal)
          ..add('categories', categories)
          ..add('months', months))
        .toString();
  }
}

class GroupOverviewBuilder
    implements Builder<GroupOverview, GroupOverviewBuilder> {
  _$GroupOverview? _$v;

  String? _month;
  String? get month => _$this._month;
  set month(String? month) => _$this._month = month;

  String? _total;
  String? get total => _$this._total;
  set total(String? total) => _$this._total = total;

  String? _previousTotal;
  String? get previousTotal => _$this._previousTotal;
  set previousTotal(String? previousTotal) =>
      _$this._previousTotal = previousTotal;

  int? _receiptCount;
  int? get receiptCount => _$this._receiptCount;
  set receiptCount(int? receiptCount) => _$this._receiptCount = receiptCount;

  int? _openReceiptCount;
  int? get openReceiptCount => _$this._openReceiptCount;
  set openReceiptCount(int? openReceiptCount) =>
      _$this._openReceiptCount = openReceiptCount;

  String? _unhealthyTotal;
  String? get unhealthyTotal => _$this._unhealthyTotal;
  set unhealthyTotal(String? unhealthyTotal) =>
      _$this._unhealthyTotal = unhealthyTotal;

  ListBuilder<GroupOverviewCategory>? _categories;
  ListBuilder<GroupOverviewCategory> get categories =>
      _$this._categories ??= ListBuilder<GroupOverviewCategory>();
  set categories(ListBuilder<GroupOverviewCategory>? categories) =>
      _$this._categories = categories;

  ListBuilder<GroupOverviewMonth>? _months;
  ListBuilder<GroupOverviewMonth> get months =>
      _$this._months ??= ListBuilder<GroupOverviewMonth>();
  set months(ListBuilder<GroupOverviewMonth>? months) =>
      _$this._months = months;

  GroupOverviewBuilder() {
    GroupOverview._defaults(this);
  }

  GroupOverviewBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _month = $v.month;
      _total = $v.total;
      _previousTotal = $v.previousTotal;
      _receiptCount = $v.receiptCount;
      _openReceiptCount = $v.openReceiptCount;
      _unhealthyTotal = $v.unhealthyTotal;
      _categories = $v.categories.toBuilder();
      _months = $v.months.toBuilder();
      _$v = null;
    }
    return this;
  }

  @override
  void replace(GroupOverview other) {
    _$v = other as _$GroupOverview;
  }

  @override
  void update(void Function(GroupOverviewBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  GroupOverview build() => _build();

  _$GroupOverview _build() {
    _$GroupOverview _$result;
    try {
      _$result = _$v ??
          _$GroupOverview._(
            month: BuiltValueNullFieldError.checkNotNull(
                month, r'GroupOverview', 'month'),
            total: BuiltValueNullFieldError.checkNotNull(
                total, r'GroupOverview', 'total'),
            previousTotal: BuiltValueNullFieldError.checkNotNull(
                previousTotal, r'GroupOverview', 'previousTotal'),
            receiptCount: BuiltValueNullFieldError.checkNotNull(
                receiptCount, r'GroupOverview', 'receiptCount'),
            openReceiptCount: BuiltValueNullFieldError.checkNotNull(
                openReceiptCount, r'GroupOverview', 'openReceiptCount'),
            unhealthyTotal: BuiltValueNullFieldError.checkNotNull(
                unhealthyTotal, r'GroupOverview', 'unhealthyTotal'),
            categories: categories.build(),
            months: months.build(),
          );
    } catch (_) {
      late String _$failedField;
      try {
        _$failedField = 'categories';
        categories.build();
        _$failedField = 'months';
        months.build();
      } catch (e) {
        throw BuiltValueNestedFieldError(
            r'GroupOverview', _$failedField, e.toString());
      }
      rethrow;
    }
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
