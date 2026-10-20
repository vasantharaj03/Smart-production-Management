from app.repositories.machine_repository import MachineRepository
from app.errors.exceptions import NotFound

class MachineService:
    def __init__(self):
        self.repository = MachineRepository()

    def list_machines(self):
        return self.repository.list_all()

    def get_machine(self, machine_id):
        row = self.repository.get_by_id(machine_id)
        if row is None: raise NotFound("Machine not found")
        return row

    def create_machine(self, payload):
        return self.repository.create(payload.model_dump())

    def update_machine(self, machine_id, payload):
        self.get_machine(machine_id)
        return self.repository.update(machine_id, payload.model_dump(exclude_unset=True))

    def delete_machine(self, machine_id):
        self.repository.delete(machine_id)
