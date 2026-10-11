package com.ridho.music.ui;

import android.app.Dialog;
import android.graphics.Canvas;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.recyclerview.widget.ItemTouchHelper;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.bottomsheet.BottomSheetDialogFragment;
import com.ridho.music.App;
import com.ridho.music.R;
import com.ridho.music.playback.PlaybackRepository;
import com.ridho.music.ui.adapter.QueueAdapter;

/**
 * Queue bottom sheet: current order with jump-to-item, per-row removal and
 * long-press drag-to-reorder. Reorders go straight to the player
 * ({@code moveMediaItem}); the service persists the new order.
 */
public class QueueSheet extends BottomSheetDialogFragment implements QueueAdapter.Callback,
        PlaybackRepository.Listener {

    private PlaybackRepository playback;
    private QueueAdapter adapter;
    private RecyclerView list;
    private ItemTouchHelper touchHelper;
    private volatile boolean dragging = false;

    @NonNull
    @Override
    public Dialog onCreateDialog(@Nullable Bundle savedInstanceState) {
        Dialog dialog = super.onCreateDialog(savedInstanceState);
        View view = LayoutInflater.from(requireContext())
                .inflate(R.layout.sheet_queue, null, false);
        dialog.setContentView(view);

        playback = App.locator().playback();
        list = view.findViewById(R.id.queue_list);
        list.setLayoutManager(new LinearLayoutManager(requireContext()));
        adapter = new QueueAdapter(this);
        list.setAdapter(adapter);
        adapter.submit(playback.queueTracks(), playback.currentIndex());

        // Long-press drag to reorder; rows tilt and dim while dragging.
        touchHelper = new ItemTouchHelper(new ItemTouchHelper.SimpleCallback(
                ItemTouchHelper.UP | ItemTouchHelper.DOWN, 0) {
            @Override
            public boolean onMove(@NonNull RecyclerView recyclerView,
                    @NonNull RecyclerView.ViewHolder viewHolder,
                    @NonNull RecyclerView.ViewHolder target) {
                int from = viewHolder.getBindingAdapterPosition();
                int to = target.getBindingAdapterPosition();
                if (from == RecyclerView.NO_POSITION || to == RecyclerView.NO_POSITION) {
                    return false;
                }
                playback.moveQueueItem(from, to);
                adapter.moveItem(from, to);
                return true;
            }

            @Override
            public boolean isLongPressDragEnabled() {
                return true;
            }

            @Override
            public void onSwiped(@NonNull RecyclerView.ViewHolder viewHolder, int direction) {
                // no swipe actions
            }

            @Override
            public void onSelectedChanged(@Nullable RecyclerView.ViewHolder viewHolder,
                    int actionState) {
                super.onSelectedChanged(viewHolder, actionState);
                dragging = actionState == ItemTouchHelper.ACTION_STATE_DRAG;
                if (viewHolder != null && dragging) {
                    viewHolder.itemView.setAlpha(0.75f);
                    viewHolder.itemView.setScaleY(1.02f);
                }
            }

            @Override
            public void clearView(@NonNull RecyclerView recyclerView,
                    @NonNull RecyclerView.ViewHolder viewHolder) {
                super.clearView(recyclerView, viewHolder);
                viewHolder.itemView.setAlpha(1f);
                viewHolder.itemView.setScaleY(1f);
            }

            @Override
            public void onChildDraw(@NonNull Canvas c, @NonNull RecyclerView recyclerView,
                    @NonNull RecyclerView.ViewHolder viewHolder, float dX, float dY,
                    int actionState, boolean isCurrentlyActive) {
                // Clamp drag translation for a lighter feel.
                super.onChildDraw(c, recyclerView, viewHolder, dX, dY * 0.6f,
                        actionState, isCurrentlyActive);
            }
        });
        touchHelper.attachToRecyclerView(list);

        return dialog;
    }

    @Override
    public void onStart() {
        super.onStart();
        playback.addListener(this);
    }

    @Override
    public void onStop() {
        playback.removeListener(this);
        super.onStop();
    }

    @Override
    public void onPlaybackChanged() {
        // Skip while a drag is in progress — a full rebind would cancel the gesture.
        if (adapter != null && !dragging) {
            adapter.submit(playback.queueTracks(), playback.currentIndex());
        }
    }

    @Override
    public void onItemClick(int position) {
        playback.skipToQueueItem(position);
        adapter.submit(playback.queueTracks(), playback.currentIndex());
    }

    @Override
    public void onRemoveClick(int position) {
        playback.removeFromQueue(position);
        adapter.submit(playback.queueTracks(), playback.currentIndex());
    }

    // Keep a reference so the helper is never GC'd while the sheet is showing.
    @Override
    public void onDestroyView() {
        if (list != null) touchHelper.attachToRecyclerView(null);
        list = null;
        super.onDestroyView();
    }
}
