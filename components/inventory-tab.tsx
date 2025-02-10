"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { usePersistentState } from "@/contexts/PersistentStateContext"
import { supabase } from "@/lib/supabase"
import { Label } from "@/components/ui/label"

// Note: The price column is not yet added to the database.
// It's being handled in the frontend for now.

type Medication = {
  id: string
  name: string
  dispensary_quantity: number
  price: number
}

type InventoryData = {
  [key: string]: {
    restocked: number
    dispensed: number
  }
}

export default function InventoryTab() {
  const { data, updateData } = usePersistentState("inventory")
  const [medications, setMedications] = useState<Medication[]>([])
  const [inventoryData, setInventoryData] = useState<InventoryData>({})
  const [newMedication, setNewMedication] = useState(data.newMedication || "")
  const [newPrice, setNewPrice] = useState(data.newPrice || 0)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    fetchMedications()
    fetchInventoryData()
  }, [])

  const updatePersistentData = useCallback(() => {
    updateData({ newMedication, newPrice })
  }, [updateData, newMedication, newPrice])

  useEffect(() => {
    updatePersistentData()
  }, [updatePersistentData])

  const fetchMedications = async () => {
    try {
      const { data, error } = await supabase.from("medications").select("id, name, dispensary_quantity").order("name")

      if (error) throw error

      // Add a default price of 0 if the price column doesn't exist
      setMedications(data.map((med) => ({ ...med, price: 0 })))
    } catch (error) {
      console.error("Error fetching medications:", error)
      toast({
        title: "Error",
        description: "Failed to fetch medications. Please check your database connection.",
        variant: "destructive",
      })
    }
  }

  const fetchInventoryData = async () => {
    try {
      // Fetch restocking data
      const { data: restockData, error: restockError } = await supabase
        .from("restocking")
        .select("medication_name, quantity")

      if (restockError) throw restockError

      // Fetch dispensing data
      const { data: dispenseData, error: dispenseError } = await supabase
        .from("dispensing")
        .select("prescription, quantity")

      if (dispenseError) throw dispenseError

      // Process the data
      const inventoryData: InventoryData = {}

      restockData.forEach((item) => {
        if (!inventoryData[item.medication_name]) {
          inventoryData[item.medication_name] = { restocked: 0, dispensed: 0 }
        }
        inventoryData[item.medication_name].restocked += item.quantity
      })

      dispenseData.forEach((item) => {
        if (!inventoryData[item.prescription]) {
          inventoryData[item.prescription] = { restocked: 0, dispensed: 0 }
        }
        inventoryData[item.prescription].dispensed += item.quantity
      })

      setInventoryData(inventoryData)
      await updateMedicationQuantities(inventoryData)
    } catch (error) {
      console.error("Error fetching inventory data:", error)
      toast({
        title: "Error",
        description: "Failed to fetch inventory data. Please check your database connection.",
        variant: "destructive",
      })
    }
  }

  const updateMedicationQuantities = async (inventoryData: InventoryData) => {
    try {
      const updates = medications.map((medication) => {
        const data = inventoryData[medication.name] || { restocked: 0, dispensed: 0 }
        const newQuantity = data.restocked - data.dispensed
        return {
          id: medication.id,
          dispensary_quantity: newQuantity >= 0 ? newQuantity : 0,
        }
      })

      const { error } = await supabase.from("medications").upsert(updates)

      if (error) throw error

      setMedications((prev) =>
        prev.map((med) => ({
          ...med,
          dispensary_quantity: inventoryData[med.name]
            ? Math.max(inventoryData[med.name].restocked - inventoryData[med.name].dispensed, 0)
            : med.dispensary_quantity,
        })),
      )
    } catch (error) {
      console.error("Error updating medication quantities:", error)
      toast({
        title: "Error",
        description: "Failed to update medication quantities.",
        variant: "destructive",
      })
    }
  }

  const handleAddMedication = async () => {
    if (!newMedication) return

    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from("medications")
        .insert([{ name: newMedication.toUpperCase(), dispensary_quantity: 0 }])
        .select()

      if (error) throw error

      setMedications((prev) => [...prev, { ...data[0], price: newPrice }])
      setNewMedication("")
      setNewPrice(0)
      toast({
        title: "Success",
        description: "Medication added successfully",
      })
    } catch (error) {
      console.error("Error adding medication:", error)
      toast({
        title: "Error",
        description: "Failed to add medication",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteMedication = async (id: string) => {
    setIsLoading(true)
    try {
      const { error } = await supabase.from("medications").delete().eq("id", id)

      if (error) throw error

      setMedications((prev) => prev.filter((med) => med.id !== id))
      toast({
        title: "Success",
        description: "Medication deleted successfully",
      })
    } catch (error) {
      console.error("Error deleting medication:", error)
      toast({
        title: "Error",
        description: "Failed to delete medication",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory Management</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="new-medication">New Medication Name</Label>
            <Input
              id="new-medication"
              placeholder="New Medication Name"
              value={newMedication}
              onChange={(e) => setNewMedication(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-price">Price (₱)</Label>
            <Input
              id="new-price"
              type="number"
              placeholder="Price"
              value={newPrice}
              onChange={(e) => setNewPrice(Number(e.target.value))}
              min="0"
              step="0.01"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={handleAddMedication}
              disabled={isLoading}
              className="w-full bg-[#4CAF50] hover:bg-[#45a049] text-white"
            >
              Add Medication
            </Button>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">Current Inventory</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medication Name</TableHead>
                <TableHead>Dispensary Quantity</TableHead>
                <TableHead>Price (₱)</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {medications.map((medication) => (
                <TableRow key={medication.id}>
                  <TableCell>{medication.name}</TableCell>
                  <TableCell>{medication.dispensary_quantity}</TableCell>
                  <TableCell>{medication.price.toFixed(2)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteMedication(medication.id)}
                      disabled={isLoading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

