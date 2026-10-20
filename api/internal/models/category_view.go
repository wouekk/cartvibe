package models

type CategoryView struct {
	Category
	NumberOfReceipts int `json:"numberOfReceipts"`
	NumberOfProducts int `json:"numberOfProducts"`
}
