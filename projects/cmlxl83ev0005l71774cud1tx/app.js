document.addEventListener('DOMContentLoaded', () => {
    const draggables = document.querySelectorAll('.card');
    const containers = document.querySelectorAll('.column');

    draggables.forEach(draggable => {
        draggable.addEventListener('dragstart', () => {
            draggable.classList.add('dragging');
        });

        draggable.addEventListener('dragend', () => {
            draggable.classList.remove('dragging');
        });
    });

    containers.forEach(container => {
        container.addEventListener('dragover', e => {
            e.preventDefault(); // Enable dropping
            const afterElement = getDragAfterElement(container, e.clientY);
            const draggable = document.querySelector('.dragging');
            if (afterElement == null) {
                container.appendChild(draggable);
            } else {
                container.insertBefore(draggable, afterElement);
            }
        });
    });

    /**
     * Determines the position in the list to insert the dragged element
     * based on the mouse Y position.
     * @param {HTMLElement} container - The column container
     * @param {number} y - The vertical mouse position
     * @returns {HTMLElement} - The element after which we should insert, or null
     */
    function getDragAfterElement(container, y) {
        // Select all cards in this container except the one being dragged
        const draggableElements = [...container.querySelectorAll('.card:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            // We want the element where the offset is negative (mouse is above element center)
            // but closest to 0
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
});