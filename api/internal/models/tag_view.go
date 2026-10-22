package models

type TagView struct {
	Tag
	NumberOfReceipts int `json:"numberOfReceipts"`
	NumberOfProducts int `json:"numberOfProducts"`
}
