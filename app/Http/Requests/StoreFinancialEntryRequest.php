<?php

namespace App\Http\Requests;

use App\Enums\EntryStatus;
use App\Enums\EntryType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreFinancialEntryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'description' => ['required', 'string', 'max:255'],
            'category' => ['required', 'string', Rule::in(config('financial.categories'))],
            'type' => ['required', Rule::enum(EntryType::class)],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:999999999.99'],
            'status' => ['required', Rule::enum(EntryStatus::class)],
            'month' => ['required', 'integer', 'min:1', 'max:12'],
            'year' => ['required', 'integer', 'min:2020', 'max:2100'],
            'notes' => ['nullable', 'string', 'max:500'],
            'due_day' => ['nullable', 'integer', 'min:1', 'max:31'],
        ];
    }

    public function messages(): array
    {
        return [
            'description.required' => 'Informe uma descrição.',
            'amount.min' => 'O valor deve ser maior que zero.',
        ];
    }
}
